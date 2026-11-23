import { newId, nextRoundAt } from "@holler/core";
import { and, type BatchItem, eq, inArray, isNotNull, not, sql } from "@holler/core/db";
import { schema } from "../db";
import { activityOf, recordChange } from "./audit";
import { memberOf, type ServiceContext, ServiceError } from "./context";
import { getHoller } from "./hollers";

const { hollers, questions, options } = schema;

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
  schedule: () => Promise<unknown>;
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
    status: "draft",
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
  const asked: BatchItem<"sqlite">[] = [];
  for (const question of qs) {
    const questionId = newId("question");
    asked.push(ctx.db.insert(questions).values({ ...question, id: questionId, hollerId: id }));
    for (const option of opts.filter((o) => o.questionId === question.id)) {
      asked.push(ctx.db.insert(options).values({ ...option, id: newId("option"), questionId }));
    }
  }
  const stillRepeating = sql`exists (select 1 from hollers s where s.id = ${seriesId} and s.repeat_rule is not null)`;
  const schedule = () =>
    recordChange(
      ctx,
      activityOf(ctx, {
        action: "holler.scheduled",
        subjectType: "holler",
        subjectId: id,
        data: { sendAt: sendAt.toISOString(), repeatOf: seriesId },
      }),
      ctx.db
        .update(hollers)
        .set({ status: "scheduled" })
        .where(and(eq(hollers.id, id), stillRepeating)),
      {
        before: [ctx.db.insert(hollers).values(row), ...asked],
        after: [ctx.db.delete(hollers).where(and(eq(hollers.id, id), not(stillRepeating)))],
      },
    );
  return { sendAt, schedule };
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
  await recordChange(
    ctx,
    activityOf(ctx, {
      action: "holler.repeat_stopped",
      subjectType: "holler",
      subjectId: seriesId,
      data: { removed: upcoming.length },
    }),
    ctx.db
      .update(hollers)
      .set({ repeatRule: null, updatedAt: now })
      .where(and(inSeries(hollers.id), isNotNull(hollers.repeatRule))),
    {
      after: [
        ctx.db
          .delete(hollers)
          .where(and(inSeries(hollers.repeatOfId), eq(hollers.status, "scheduled"))),
        ctx.db
          .update(hollers)
          .set({ repeatRule: null, updatedAt: now })
          .where(inSeries(hollers.repeatOfId)),
      ],
    },
  );
  return getHoller(ctx, seriesId);
}
