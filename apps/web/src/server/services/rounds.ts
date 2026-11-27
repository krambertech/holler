import {
  newId,
  nextRoundAt,
  type RepeatEvery,
  type RoundOut,
  type RoundsOut,
  repeatDays,
  repeatEvery,
} from "@holler/core";
import {
  and,
  type BatchItem,
  desc,
  eq,
  inArray,
  isNotNull,
  not,
  or,
  type SQL,
  sql,
} from "@holler/core/db";
import { schema } from "../db";
import { activityOf, recordChange } from "./audit";
import { memberOf, type ServiceContext, ServiceError } from "./context";
import { getHoller, visibleTo } from "./hollers";
import { resultsFor } from "./responses";
import { creatorOf, goesLiveAt } from "./send-clock";

const { hollers, questions, options, recipients } = schema;

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
  const at = Object.fromEntries(
    repeatEvery.map((every) => [
      every,
      nextRoundAt(first?.sendAt ?? thisRound, every, timeZone, thisRound),
    ]),
  ) as Record<RepeatEvery, Date>;
  const sendAt = at[source.repeatRule];
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
  const seriesRule = sql`(select s.repeat_rule from hollers s where s.id = ${seriesId})`;
  const onSeriesRule = sql`case ${seriesRule} when 'fortnight' then ${at.fortnight.getTime()} else ${at.week.getTime()} end`;
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
        .set({ status: "scheduled", repeatRule: seriesRule, sendAt: onSeriesRule })
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

const openTooLong: Record<RepeatEvery, string> = {
  week: "Each round stays open for longer than a week. Edit the next round so it closes within a week, then repeat it every week.",
  fortnight:
    "Each round stays open for longer than a fortnight. Edit the next round so it closes within a fortnight, then repeat it every fortnight.",
};

export async function changeRepeat(ctx: ServiceContext, hollerId: string, every: RepeatEvery) {
  const memberId = memberOf(ctx);
  const holler = await ctx.db.query.hollers.findFirst({
    where: and(eq(hollers.id, hollerId), eq(hollers.workspaceId, ctx.workspaceId)),
  });
  if (!holler || holler.creatorId !== memberId) {
    throw new ServiceError(
      "not_found",
      "That Holler does not exist, or only the person who wrote it can change how often it repeats.",
    );
  }
  const seriesId = holler.repeatOfId ?? holler.id;
  const first = await repeatingFirst(ctx, seriesId);
  if (first.repeatRule === every) return getHoller(ctx, seriesId);
  const inSeries = and(
    eq(hollers.workspaceId, ctx.workspaceId),
    or(eq(hollers.id, seriesId), eq(hollers.repeatOfId, seriesId)),
  );
  const series = await ctx.db
    .select({
      id: hollers.id,
      status: hollers.status,
      sendAt: hollers.sendAt,
      closesAt: hollers.closesAt,
      closeAfterHours: hollers.closeAfterHours,
    })
    .from(hollers)
    .where(inSeries);
  const upcoming = series.find((round) => round.status === "scheduled");
  if (upcoming && upcoming.closeAfterHours > repeatDays[every] * 24) {
    throw new ServiceError("invalid", openTooLong[every], "closeAfterHours");
  }
  const now = ctx.now();
  const timeZone = (await creatorOf(ctx.db, first)).timeZone;
  const latest = Math.max(
    now.getTime(),
    ...series
      .filter((round) => round.status !== "scheduled")
      .map((round) => round.sendAt?.getTime() ?? 0),
  );
  const sendAt = nextRoundAt(first.sendAt ?? now, every, timeZone, new Date(latest));
  const liveAt = goesLiveAt(
    { sendAt, sendInRecipientTimeZone: first.sendInRecipientTimeZone },
    timeZone,
  );
  if (
    series.some(
      (round) => round.status === "live" && round.closesAt && liveAt && round.closesAt > liveAt,
    )
  ) {
    throw new ServiceError(
      "conflict",
      "The round that is out now stays open past when the next one would go out. Close it first, then change how often it repeats.",
    );
  }
  const moves = upcoming && upcoming.id !== seriesId ? upcoming : null;
  const unchanged: SQL = upcoming
    ? sql`exists (select 1 from hollers u where u.id = ${upcoming.id} and u.status = 'scheduled')`
    : sql`not exists (select 1 from hollers u where (u.id = ${seriesId} or u.repeat_of_id = ${seriesId}) and u.status = 'scheduled')`;
  const changed = await recordChange(
    ctx,
    activityOf(ctx, {
      action: "holler.repeat_changed",
      subjectType: "holler",
      subjectId: seriesId,
      data: { from: first.repeatRule, to: every, ...(moves && { sendAt: sendAt.toISOString() }) },
    }),
    ctx.db
      .update(hollers)
      .set({ repeatRule: every, updatedAt: now })
      .where(and(inSeries, eq(hollers.repeatRule, first.repeatRule), unchanged))
      .returning({ id: hollers.id }),
    {
      after: moves
        ? [
            ctx.db
              .update(hollers)
              .set({ sendAt, updatedAt: now })
              .where(
                and(
                  eq(hollers.id, moves.id),
                  eq(hollers.status, "scheduled"),
                  eq(hollers.repeatRule, every),
                ),
              ),
          ]
        : [],
    },
  );
  if (changed.length === 0 && (await repeatingFirst(ctx, seriesId)).repeatRule !== every) {
    throw new ServiceError(
      "conflict",
      "A round of this pulse went out while you changed it. Look at the rounds again, then try once more.",
    );
  }
  return getHoller(ctx, seriesId);
}

async function repeatingFirst(ctx: ServiceContext, seriesId: string) {
  const first = await ctx.db.query.hollers.findFirst({ where: eq(hollers.id, seriesId) });
  if (!first?.repeatRule) {
    throw new ServiceError(
      "invalid",
      "This pulse no longer repeats. Duplicate it to start a new one.",
      "repeat",
    );
  }
  return { ...first, repeatRule: first.repeatRule };
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
