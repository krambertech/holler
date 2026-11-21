import { newId, nextRoundAt, type RoundOut, type RoundsOut } from "@holler/core";
import { and, type BatchItem, desc, eq, inArray, not, or, sql } from "@holler/core/db";
import { runBatch } from "../batch";
import { schema } from "../db";
import { auditStatement } from "./audit";
import { memberOf, type ServiceContext, ServiceError } from "./context";
import { getHoller, visibleTo } from "./hollers";
import { resultsFor } from "./responses";

const { hollers, questions, options, activity, recipients } = schema;

export const ROUNDS_SHOWN = 26;

type HollerRow = typeof hollers.$inferSelect;

export const roundColumns = {
  id: "round",
  workspaceId: "copy",
  creatorId: "copy",
  mode: "copy",
  status: "round",
  title: "copy",
  searchTitle: "copy",
  description: "copy",
  externalUrl: "copy",
  anonymous: "copy",
  visibility: "copy",
  tags: "copy",
  audience: "copy",
  announceChannelId: "copy",
  announceTs: "round",
  sendAt: "round",
  sendInRecipientTimeZone: "copy",
  sentAt: "round",
  closeAfterHours: "copy",
  closesAt: "round",
  closedAt: "round",
  closeQueuedAt: "round",
  remindersEnabled: "copy",
  remindedAt: "round",
  reportToken: "round",
  createdVia: "copy",
  idempotencyKey: "round",
  repeatOfId: "round",
  repeatRule: "copy",
  createdAt: "round",
  updatedAt: "round",
} as const satisfies Record<keyof HollerRow, "copy" | "round">;

type Kind<K extends keyof HollerRow> = (typeof roundColumns)[K];
type RoundKey = { [K in keyof HollerRow]: Kind<K> extends "round" ? K : never }[keyof HollerRow];

export function roundOf(source: HollerRow, fresh: Pick<HollerRow, RoundKey>): HollerRow {
  const copied = Object.fromEntries(
    (Object.keys(roundColumns) as (keyof HollerRow)[])
      .filter((key) => roundColumns[key] === "copy")
      .map((key) => [key, source[key]]),
  ) as Omit<HollerRow, RoundKey>;
  return { ...copied, ...fresh };
}

export interface NextRound {
  sendAt: Date;
  statements: BatchItem<"sqlite">[];
}

export async function nextRound(
  ctx: ServiceContext,
  hollerId: string,
  timeZone: string | null,
): Promise<NextRound | null> {
  const source = await ctx.db.query.hollers.findFirst({
    where: and(eq(hollers.id, hollerId), eq(hollers.workspaceId, ctx.workspaceId)),
  });
  if (!source?.repeatRule) return null;
  const now = ctx.now();
  const seriesId = source.repeatOfId ?? source.id;
  const first =
    source.repeatOfId === null
      ? source
      : await ctx.db.query.hollers.findFirst({ where: eq(hollers.id, seriesId) });
  const thisRound = source.sendAt && source.sendAt > now ? source.sendAt : now;
  const sendAt = nextRoundAt(first?.sendAt ?? thisRound, source.repeatRule, timeZone, thisRound);
  const id = newId("holler");
  const row = roundOf(source, {
    id,
    status: "scheduled",
    announceTs: null,
    sendAt,
    sentAt: null,
    closesAt: null,
    closedAt: null,
    closeQueuedAt: null,
    remindedAt: null,
    reportToken: null,
    idempotencyKey: null,
    repeatOfId: seriesId,
    createdAt: now,
    updatedAt: now,
  });

  const qs = await ctx.db.select().from(questions).where(eq(questions.hollerId, source.id));
  const opts =
    qs.length === 0
      ? []
      : await ctx.db
          .select()
          .from(options)
          .where(
            inArray(
              options.questionId,
              // oxlint-disable-next-line holler/bounded-in-array -- a Holler has at most 30 questions
              qs.map((q) => q.id),
            ),
          );
  const statements: BatchItem<"sqlite">[] = [ctx.db.insert(hollers).values(row)];
  for (const question of qs) {
    const questionId = newId("question");
    statements.push(ctx.db.insert(questions).values({ ...question, id: questionId, hollerId: id }));
    for (const option of opts.filter((o) => o.questionId === question.id)) {
      statements.push(
        ctx.db.insert(options).values({ ...option, id: newId("option"), questionId }),
      );
    }
  }
  statements.push(
    auditStatement(ctx, {
      action: "holler.scheduled",
      subjectType: "holler",
      subjectId: id,
      data: { sendAt: sendAt.toISOString(), repeatOf: seriesId },
    }),
  );
  statements.push(...unlessStillRepeating(ctx, id, seriesId));
  return { sendAt, statements };
}

function unlessStillRepeating(
  ctx: ServiceContext,
  roundId: string,
  seriesId: string,
): BatchItem<"sqlite">[] {
  const stillRepeating = sql`exists (select 1 from hollers s where s.id = ${seriesId} and s.repeat_rule is not null)`;
  const roundGone = sql`not exists (select 1 from hollers r where r.id = ${roundId})`;
  return [
    ctx.db.delete(hollers).where(and(eq(hollers.id, roundId), not(stillRepeating))),
    ctx.db
      .delete(activity)
      .where(
        and(eq(activity.subjectId, roundId), eq(activity.action, "holler.scheduled"), roundGone),
      ),
  ];
}

export async function stopRepeating(ctx: ServiceContext, hollerId: string) {
  const memberId = memberOf(ctx);
  const holler = await ctx.db.query.hollers.findFirst({
    where: and(eq(hollers.id, hollerId), eq(hollers.workspaceId, ctx.workspaceId)),
  });
  if (!holler || holler.creatorId !== memberId) {
    throw new ServiceError(
      "not_found",
      "That Holler does not exist, or only the person who wrote it can stop it repeating.",
    );
  }
  const seriesId = holler.repeatOfId ?? holler.id;
  const inSeries = (column: typeof hollers.id | typeof hollers.repeatOfId) =>
    and(eq(hollers.workspaceId, ctx.workspaceId), eq(column, seriesId));
  const upcoming = await ctx.db
    .select({ id: hollers.id })
    .from(hollers)
    .where(and(inSeries(hollers.repeatOfId), eq(hollers.status, "scheduled")));
  const now = ctx.now();
  await runBatch(ctx.db, [
    ctx.db
      .delete(hollers)
      .where(and(inSeries(hollers.repeatOfId), eq(hollers.status, "scheduled"))),
    ctx.db.update(hollers).set({ repeatRule: null, updatedAt: now }).where(inSeries(hollers.id)),
    ctx.db
      .update(hollers)
      .set({ repeatRule: null, updatedAt: now })
      .where(inSeries(hollers.repeatOfId)),
    auditStatement(ctx, {
      action: "holler.repeat_stopped",
      subjectType: "holler",
      subjectId: seriesId,
      data: { removed: upcoming.length },
    }),
  ]);
  return getHoller(ctx, seriesId);
}

export async function listRounds(ctx: ServiceContext, hollerId: string): Promise<RoundsOut> {
  const holler = await getHoller(ctx, hollerId);
  const seriesId = holler.repeatOfId ?? holler.id;
  const rows = await ctx.db
    .select({
      id: hollers.id,
      status: hollers.status,
      sendAt: hollers.sendAt,
      repeatRule: hollers.repeatRule,
      recipientCount: sql<number>`(select count(*) from ${recipients} where ${recipients.hollerId} = ${hollers.id})`,
    })
    .from(hollers)
    .where(
      and(
        or(eq(hollers.id, seriesId), eq(hollers.repeatOfId, seriesId)),
        visibleTo(ctx, memberOf(ctx)),
      ),
    )
    .orderBy(desc(hollers.sendAt), desc(hollers.createdAt))
    .limit(ROUNDS_SHOWN);
  const first = rows.find((row) => row.id === seriesId);
  const rounds: RoundOut[] = [];
  for (const row of rows) {
    const sent = row.status === "live" || row.status === "closed";
    const results = sent ? await resultsFor(ctx, row.id) : null;
    const tops = sent ? await scaleTops(ctx, row.id) : new Map<number, number>();
    const scores =
      results?.state === "open"
        ? results.questions.flatMap((question, position) =>
            question.type === "single" && question.style === "scale"
              ? [
                  {
                    position,
                    prompt: question.prompt,
                    average: question.average,
                    top: tops.get(position) ?? 0,
                  },
                ]
              : [],
          )
        : [];
    rounds.push({
      id: row.id,
      status: row.status,
      sendAt: row.sendAt?.toISOString() ?? null,
      recipientCount: Number(row.recipientCount),
      responseCount: results?.responseCount ?? 0,
      gated: results?.state === "gated",
      scores,
    });
  }
  return { repeat: (first ?? holler).repeatRule ?? null, rounds };
}

async function scaleTops(ctx: ServiceContext, hollerId: string) {
  const rows = await ctx.db
    .select({ position: questions.position, top: sql<number | null>`max(${options.score})` })
    .from(options)
    .innerJoin(questions, eq(questions.id, options.questionId))
    .where(eq(questions.hollerId, hollerId))
    .groupBy(questions.id);
  return new Map(rows.map((row) => [row.position, Number(row.top ?? 0)]));
}
