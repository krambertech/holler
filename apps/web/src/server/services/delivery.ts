import {
  earliestInstantOf,
  hollerTitle,
  nextReminder,
  type ReminderTone,
  reminderTiers,
  sameWallClockIn,
} from "@holler/core";
import {
  and,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "@holler/core/db";
import { runBatch } from "../batch";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import { productUrl } from "../product-url";
import { type SlackHoller, surfaceOf, timeOfDay } from "../slack/blocks/format";
import {
  type AnswerSummary,
  announcementMessage,
  answeredMessage,
  closedMessage,
  closeNoticeMessage,
  inviteMessage,
  reminderMessage,
  sendFailedMessage,
} from "../slack/blocks/messages";
import { type PostMessage, SlackApiError, type SlackClient } from "../slack/client";
import { activityOf, recordChange, takeBack } from "./audit";
import { type ServiceContext, ServiceError } from "./context";
import { getHoller, presentQuestion, sendProblems } from "./hollers";
import { respondUrl } from "./respond-links";
import { nextRound } from "./rounds";
import { slackFor } from "./slack-connection";
import { claimSlackDelivery, releaseSlackDelivery } from "./slack-deliveries";
import { assertCanSend } from "./usage";

/**
 * Everything that sends. `sendHoller`, `closeHoller` and `remindWaiting` are the doors every
 * caller uses (web, API, MCP); the cron runs the `queue*` and `sendDueHollers` passes. They change
 * the database and put Slack work on SLACK_SENDS; `deliver` is what the consumer runs for each
 * message. docs/slack.md, Sending.
 */

const { hollers, recipients, slackPeople, members, workspaces, questions, options } = schema;

/** One message on SLACK_SENDS. Small, so a retry reloads the current state before it posts. */
export type SlackSend =
  | { kind: "invite"; hollerId: string; slackUserId: string }
  | {
      kind: "reminder";
      hollerId: string;
      slackUserId: string;
      tone: ReminderTone;
      /** When it was claimed: with the person, the reminder's identity for posting once. */
      queuedAt: string;
    }
  | {
      kind: "answered";
      hollerId: string;
      slackUserId: string;
      also?: DmRef | undefined;
      /** Set right after an answer in the DM, so its follow-up note box finds the response. */
      responseId?: string | undefined;
    }
  | { kind: "closed"; hollerId: string; slackUserId: string; also?: DmRef | undefined }
  | { kind: "snoozed"; hollerId: string; slackUserId: string; reminder: DmRef }
  | { kind: "announce"; hollerId: string }
  | { kind: "close_notice"; hollerId: string }
  | { kind: "send_failed"; hollerId: string; reason: string; queuedAt: string };

/**
 * What each send does in Slack. A post makes a new message, so the consumer claims it in
 * `slack_deliveries` under `postKey` before posting and a send delivered twice posts once. An
 * edit rewrites a message to the current state, so doing it twice is harmless. A new kind of
 * send must say which it is here.
 */
export const sendEffects = {
  invite: "posts",
  reminder: "posts",
  announce: "posts",
  close_notice: "posts",
  send_failed: "posts",
  answered: "edits",
  closed: "edits",
  snoozed: "edits",
} as const satisfies Record<SlackSend["kind"], "posts" | "edits">;

/** The once-only identity of a send that posts. */
export function postKey(send: Extract<SlackSend, { kind: keyof PostingKinds }>): string {
  switch (send.kind) {
    case "invite":
      return `post:invite:${send.hollerId}:${send.slackUserId}`;
    case "reminder":
      return `post:reminder:${send.hollerId}:${send.slackUserId}:${send.queuedAt}`;
    case "announce":
      return `post:announce:${send.hollerId}`;
    case "close_notice":
      return `post:close_notice:${send.hollerId}`;
    case "send_failed":
      return `post:send_failed:${send.hollerId}:${send.queuedAt}`;
  }
}

type PostingKinds = {
  [K in keyof typeof sendEffects as (typeof sendEffects)[K] extends "posts" ? K : never]: true;
};

/** A message in someone's DM. `also` names the one they tapped when it is not the latest. */
export interface DmRef {
  channel: string;
  ts: string;
}

type HollerDetail = Awaited<ReturnType<typeof getHoller>>;

const HOUR = 60 * 60 * 1000;
/** Slack's sendBatch takes at most 100 messages; D1 runs 100 statements per batch comfortably. */
const CHUNK = 100;
/** A creator's Send reminder can go once in this long. */
export const manualReminderGapHours = 4;
/** A per-zone send goes live when the first zone, UTC+14, reaches the send time. */
const zoneLeadHours = 26;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += CHUNK)
    out.push(items.slice(start, start + CHUNK));
  return out;
}

export async function enqueue(env: Bindings, sends: SlackSend[]): Promise<void> {
  await queueClaimed(env, sends, async () => {});
}

/**
 * Queues the sends for rows a guarded update just claimed. When the queue refuses a chunk,
 * `release` gets that chunk and every later one, the sends that never reached the queue, to give
 * their claims back so the next run retries them; then the error is thrown. Claimed work is
 * never lost, and work that was queued is never released to be sent twice.
 */
export async function queueClaimed(
  env: Bindings,
  sends: SlackSend[],
  release: (unqueued: SlackSend[]) => Promise<unknown>,
): Promise<void> {
  const batches = chunks(sends);
  for (const [index, batch] of batches.entries()) {
    try {
      await env.SLACK_SENDS.sendBatch(batch.map((body) => ({ body })));
    } catch (error) {
      await release(batches.slice(index).flat());
      throw error;
    }
  }
}

/** Gives back the invite claims of sends that never reached the queue. */
async function releaseInvites(db: Db, unqueued: SlackSend[]) {
  const statements = unqueued.flatMap((send) =>
    send.kind === "invite"
      ? [
          db
            .update(recipients)
            .set({ invitedAt: null })
            .where(
              and(
                eq(recipients.hollerId, send.hollerId),
                eq(recipients.slackUserId, send.slackUserId),
                isNull(recipients.dmTs),
              ),
            ),
        ]
      : [],
  );
  for (const chunk of chunks(statements)) await runBatch(db, chunk);
}

function requireCreator(holler: HollerDetail, doing: string) {
  if (!holler.isCreator) {
    throw new ServiceError("forbidden", `Only the person who wrote this Holler can ${doing} it.`);
  }
}

async function assertInstalled(db: Db, workspaceId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { uninstalledAt: true },
  });
  if (workspace?.uninstalledAt) {
    throw new ServiceError(
      "slack_unavailable",
      "Holler was removed from this Slack workspace, so sending is paused. An owner can add it to Slack again from Settings.",
    );
  }
}

/** Every send problem in one error, so the editor can show each beside its field. */
function assertSendable(problems: { message: string; field?: string | null | undefined }[]) {
  const [first] = problems;
  if (!first) return;
  throw new ServiceError(
    "invalid",
    first.message,
    first.field ?? undefined,
    problems.map((p) => ({ message: p.message, field: p.field ?? null })),
  );
}

async function timeZoneOf(db: Db, workspaceId: string, slackUserId: string) {
  const person = await db.query.slackPeople.findFirst({
    where: and(eq(slackPeople.workspaceId, workspaceId), eq(slackPeople.slackUserId, slackUserId)),
    columns: { timeZone: true },
  });
  return person?.timeZone ?? null;
}

async function creatorOf(db: Db, holler: { workspaceId: string; creatorId: string }) {
  const creator = await db.query.members.findFirst({
    where: eq(members.id, holler.creatorId),
    columns: { slackUserId: true },
  });
  if (!creator) throw new Error(`Holler creator ${holler.creatorId} has no member row`);
  return {
    slackUserId: creator.slackUserId,
    timeZone: await timeZoneOf(db, holler.workspaceId, creator.slackUserId),
  };
}

/** When a Holler with a send time goes live: that time, or for a per-zone send the first zone's. */
function goesLiveAt(
  holler: { sendAt: Date | null; sendInRecipientTimeZone: boolean },
  creatorZone: string | null,
) {
  if (!holler.sendAt) return null;
  return holler.sendInRecipientTimeZone
    ? earliestInstantOf(holler.sendAt, creatorZone)
    : holler.sendAt;
}

/**
 * Sends a Holler now, or schedules it when its send time is still ahead. Refuses with every send
 * problem at once, or `limit_reached` when Free has used this month's hollers.
 */
export async function sendHoller(
  ctx: ServiceContext,
  env: Bindings,
  id: string,
): Promise<HollerDetail> {
  const holler = await getHoller(ctx, id);
  requireCreator(holler, "send");
  if (holler.status === "live" || holler.status === "closed") {
    throw new ServiceError("conflict", "This Holler was already sent.");
  }
  assertSendable(holler.problems);
  await assertCanSend(ctx);
  await assertInstalled(ctx.db, ctx.workspaceId);

  const now = ctx.now();
  const creator = await creatorOf(ctx.db, holler);
  const liveAt = goesLiveAt(holler, creator.timeZone);
  if (liveAt && liveAt > now) {
    if (holler.status === "draft") {
      await recordChange(
        ctx,
        activityOf(ctx, {
          action: "holler.scheduled",
          subjectType: "holler",
          subjectId: id,
          data: { sendAt: holler.sendAt?.toISOString() },
        }),
        ctx.db
          .update(hollers)
          .set({ status: "scheduled", updatedAt: now })
          .where(and(eq(hollers.id, id), eq(hollers.status, "draft"))),
      );
    }
    return getHoller(ctx, id);
  }
  await goLive(ctx, env, holler, creator.timeZone);
  return getHoller(ctx, id);
}

/**
 * Who a Holler goes to: people by name, the members of user groups and channels, or everyone.
 * Only people in the directory who are not bots and have not left. The first way a person was
 * chosen is kept, so `added_via` gives the most specific reason.
 */
async function resolveAudience(
  db: Db,
  slack: SlackClient,
  workspaceId: string,
  audience: HollerDetail["audience"],
): Promise<Map<string, string>> {
  const chosen = new Map<string, string>();
  const add = (slackUserId: string, via: string) => {
    if (!chosen.has(slackUserId)) chosen.set(slackUserId, via);
  };
  for (const person of audience.people) add(person, "person");
  for (const group of audience.groups) {
    // User group ids start with S; anything else is a channel.
    if (group.startsWith("S")) {
      for (const person of await slack.userGroupMembers(group)) add(person, `group:${group}`);
      continue;
    }
    let cursor: string | undefined;
    do {
      const page = await slack.channelMembers(group, cursor);
      for (const person of page.members) add(person, `group:${group}`);
      cursor = page.nextCursor || undefined;
    } while (cursor);
  }
  const directory = await db
    .select({ slackUserId: slackPeople.slackUserId })
    .from(slackPeople)
    .where(
      and(
        eq(slackPeople.workspaceId, workspaceId),
        eq(slackPeople.isBot, false),
        eq(slackPeople.isDeleted, false),
      ),
    );
  const reachable = new Set(directory.map((row) => row.slackUserId));
  if (audience.everyone) for (const person of reachable) add(person, "everyone");
  for (const person of chosen.keys()) if (!reachable.has(person)) chosen.delete(person);
  return chosen;
}

/**
 * Resolves the audience, writes the recipients, marks the Holler live and queues the invites due
 * now. The status guard means two sends at once go out once: the loser gets `conflict`.
 */
async function goLive(
  ctx: ServiceContext,
  env: Bindings,
  holler: {
    id: string;
    status: "draft" | "scheduled" | "live" | "closed";
    audience: HollerDetail["audience"];
    sendAt: Date | null;
    sendInRecipientTimeZone: boolean;
    closeAfterHours: number;
    announceChannelId: string | null;
  },
  creatorZone: string | null,
): Promise<void> {
  const now = ctx.now();
  const slack = await slackFor(env, ctx.db, ctx.workspaceId);
  const audience = await resolveAudience(ctx.db, slack, ctx.workspaceId, holler.audience);
  if (audience.size === 0) {
    throw new ServiceError(
      "invalid",
      "Nobody in this audience can get a Holler. Choose people who are in Slack.",
      "audience",
    );
  }
  const zones = new Map<string, string | null>();
  if (holler.sendInRecipientTimeZone) {
    const rows = await ctx.db
      .select({ slackUserId: slackPeople.slackUserId, timeZone: slackPeople.timeZone })
      .from(slackPeople)
      .where(eq(slackPeople.workspaceId, ctx.workspaceId));
    for (const row of rows) zones.set(row.slackUserId, row.timeZone);
  }
  const theirTime = (at: Date, slackUserId: string) =>
    holler.sendInRecipientTimeZone
      ? sameWallClockIn(at, creatorZone, zones.get(slackUserId) ?? null)
      : at;
  const sendAtFor = (slackUserId: string) => {
    if (!holler.sendInRecipientTimeZone || !holler.sendAt) return now;
    const theirs = theirTime(holler.sendAt, slackUserId);
    // Someone whose time already passed gets it at once.
    return new Date(Math.max(theirs.getTime(), now.getTime()));
  };
  const rows = [...audience].map(([slackUserId, addedVia]) => {
    const sendAt = sendAtFor(slackUserId);
    return { slackUserId, addedVia, sendAt, invitedAt: sendAt <= now ? now : null };
  });
  const lastSend = Math.max(...rows.map((row) => row.sendAt.getTime()));
  const next = await nextRound(ctx, holler.id, creatorZone);
  const nextInvite = next
    ? Math.min(...rows.map((row) => theirTime(next.sendAt, row.slackUserId).getTime()))
    : Number.POSITIVE_INFINITY;
  const closesAt = new Date(Math.min(lastSend + holler.closeAfterHours * HOUR, nextInvite));

  const sent = activityOf(ctx, {
    action: "holler.sent",
    subjectType: "holler",
    subjectId: holler.id,
    data: { recipients: rows.length },
  });
  const [claimed] = await recordChange(
    ctx,
    sent,
    ctx.db
      .update(hollers)
      .set({ status: "live", sentAt: now, closesAt, updatedAt: now })
      .where(and(eq(hollers.id, holler.id), inArray(hollers.status, ["draft", "scheduled"])))
      .returning({ id: hollers.id }),
  );
  if (!claimed) throw new ServiceError("conflict", "This Holler was already sent.");

  try {
    // One recipient per statement: D1 binds at most 100 values in one.
    const inserts = rows.map((row) =>
      ctx.db.insert(recipients).values({ hollerId: holler.id, ...row }),
    );
    for (const chunk of chunks(inserts)) await runBatch(ctx.db, chunk);
    await next?.schedule();
  } catch (error) {
    // D1 runs each batch as a transaction but not the chunks together, so undo the send by hand.
    await takeBack(ctx, sent, [
      ctx.db.delete(recipients).where(eq(recipients.hollerId, holler.id)),
      ctx.db
        .update(hollers)
        .set({ status: holler.status, sentAt: null, closesAt: null })
        .where(eq(hollers.id, holler.id)),
    ]);
    throw error;
  }

  const sends: SlackSend[] = rows
    .filter((row) => row.invitedAt)
    .map((row) => ({ kind: "invite", hollerId: holler.id, slackUserId: row.slackUserId }));
  if (holler.announceChannelId) sends.push({ kind: "announce", hollerId: holler.id });
  try {
    await queueClaimed(env, sends, (unqueued) => releaseInvites(ctx.db, unqueued));
  } catch (error) {
    // The send happened. The invites it could not queue are unclaimed again, so the cron's
    // invite pass sends them within a minute, and its announcement pass posts the announcement.
    console.error("invites not queued; the cron will retry", holler.id, error);
  }
}

/** Closes a live Holler now. Closing a closed one again changes nothing. */
export async function closeHoller(
  ctx: ServiceContext,
  env: Bindings,
  id: string,
): Promise<HollerDetail> {
  const holler = await getHoller(ctx, id);
  requireCreator(holler, "close");
  if (holler.status === "closed") return holler;
  if (holler.status !== "live") {
    throw new ServiceError(
      "conflict",
      "Only a live Holler can be closed. This one is not sent yet.",
    );
  }
  const now = ctx.now();
  const [closed] = await recordChange(
    ctx,
    activityOf(ctx, {
      action: "holler.closed",
      subjectType: "holler",
      subjectId: id,
      data: { reason: "creator" },
    }),
    ctx.db
      .update(hollers)
      .set({ status: "closed", closedAt: now, updatedAt: now })
      .where(and(eq(hollers.id, id), eq(hollers.status, "live")))
      .returning({ id: hollers.id }),
  );
  if (closed) {
    try {
      await queueCloseWork(ctx.db, env, now, id);
    } catch (error) {
      // It is closed; the cron's close pass queues what this could not within a minute.
      console.error("close work not queued; the cron will retry", id, error);
    }
  }
  return getHoller(ctx, id);
}

/** How far back the cron looks for closed hollers whose close work was never queued. */
const closeCatchUpHours = 24;

/**
 * After hollers close: edit each unanswered DM, update the announcement, tell the creator. Each
 * Holler's close work is claimed once with `close_queued_at`. With `hollerIds` it queues those;
 * without, it catches up every Holler that closed in the last day and was never queued, which
 * is how the cron retries work a failed queue gave back.
 */
export async function queueCloseWork(
  db: Db,
  env: Bindings,
  now: Date,
  hollerId?: string | undefined,
): Promise<string[]> {
  const candidates = await db
    .select({ id: hollers.id })
    .from(hollers)
    .where(
      and(
        eq(hollers.status, "closed"),
        isNull(hollers.closeQueuedAt),
        hollerId
          ? eq(hollers.id, hollerId)
          : gte(hollers.closedAt, new Date(now.getTime() - closeCatchUpHours * HOUR)),
      ),
    );
  const queued: string[] = [];
  // One claim per Holler, just before its work is queued: if the queue fails, the ones after it
  // were never claimed and the next pass takes them.
  for (const candidate of candidates) {
    const [holler] = await db
      .update(hollers)
      .set({ closeQueuedAt: now })
      .where(and(eq(hollers.id, candidate.id), isNull(hollers.closeQueuedAt)))
      .returning({ id: hollers.id, announceTs: hollers.announceTs });
    if (!holler) continue;
    const waiting = await db
      .select({ slackUserId: recipients.slackUserId })
      .from(recipients)
      .where(
        and(
          eq(recipients.hollerId, holler.id),
          isNull(recipients.answeredAt),
          isNotNull(recipients.dmTs),
        ),
      );
    // The notice goes last: once it is queued, everything before it was too.
    const sends: SlackSend[] = [
      ...waiting.map((row) => ({
        kind: "closed" as const,
        hollerId: holler.id,
        slackUserId: row.slackUserId,
      })),
      ...(holler.announceTs ? [{ kind: "announce" as const, hollerId: holler.id }] : []),
      { kind: "close_notice", hollerId: holler.id },
    ];
    // DM edits are idempotent, so a retry may repeat them; the notice is only ever queued once.
    await queueClaimed(env, sends, () =>
      db.update(hollers).set({ closeQueuedAt: null }).where(eq(hollers.id, holler.id)),
    );
    queued.push(holler.id);
  }
  return queued;
}

/**
 * The creator's Send reminder: a reminder now to everyone still waiting, counted as each person's
 * next reminder in the rhythm. `reminded_at` is claimed with a guarded update, so two clicks at
 * once send one round, and the next can follow four hours later.
 */
export async function remindWaiting(
  ctx: ServiceContext,
  env: Bindings,
  id: string,
): Promise<HollerDetail> {
  const holler = await getHoller(ctx, id);
  requireCreator(holler, "send a reminder for");
  if (holler.status !== "live") {
    throw new ServiceError("closed", "Reminders go out only while a Holler is live.");
  }
  const now = ctx.now();
  const waitingWhere = and(
    eq(recipients.hollerId, id),
    isNull(recipients.answeredAt),
    isNull(recipients.failure),
    isNotNull(recipients.dmTs),
  );
  const before = await ctx.db
    .select({
      slackUserId: recipients.slackUserId,
      remindersSent: recipients.remindersSent,
      nextReminderAt: recipients.nextReminderAt,
    })
    .from(recipients)
    .where(waitingWhere);
  const nobodyWaiting = () =>
    new ServiceError(
      "conflict",
      "Nobody is waiting to be reminded. Everyone who got it has answered.",
    );
  if (before.length === 0) throw nobodyWaiting();
  const gapStart = new Date(now.getTime() - manualReminderGapHours * HOUR);
  const mayRemind = and(
    eq(hollers.id, id),
    or(isNull(hollers.remindedAt), lte(hollers.remindedAt, gapStart)),
  );
  const sent = activityOf(ctx, {
    action: "holler.reminded",
    subjectType: "holler",
    subjectId: id,
    data: { recipients: before.length },
  });
  const reminded = await recordChange(
    ctx,
    sent,
    ctx.db
      .update(recipients)
      .set({
        remindersSent: sql`min(${recipients.remindersSent} + 1, ${reminderTiers.length})`,
        nextReminderAt: null,
      })
      .where(
        and(waitingWhere, exists(ctx.db.select({ id: hollers.id }).from(hollers).where(mayRemind))),
      )
      .returning({ slackUserId: recipients.slackUserId, remindersSent: recipients.remindersSent }),
    {
      after: [
        ctx.db
          .update(hollers)
          .set({ remindedAt: now })
          .where(and(mayRemind, sql`changes() > 0`)),
      ],
    },
  );
  if (reminded.length === 0) {
    const [row] = await ctx.db
      .select({ remindedAt: hollers.remindedAt })
      .from(hollers)
      .where(eq(hollers.id, id));
    const last = row?.remindedAt;
    if (!last || last <= gapStart) throw nobodyWaiting();
    const next = new Date(last.getTime() + manualReminderGapHours * HOUR);
    const zone = (await creatorOf(ctx.db, holler)).timeZone;
    throw new ServiceError(
      "conflict",
      `A reminder went out at ${timeOfDay(last, zone)}. You can send the next one at ${timeOfDay(next, zone)}.`,
    );
  }
  const sends = reminded.map((row) => ({
    kind: "reminder" as const,
    hollerId: id,
    slackUserId: row.slackUserId,
    tone: toneFor(row.remindersSent),
    queuedAt: now.toISOString(),
  }));
  // Nothing went out, so everything goes back as it was and the creator can try again.
  await queueClaimed(env, sends, async (unqueued) => {
    const restore = before
      .filter((row) =>
        unqueued.some((send) => "slackUserId" in send && send.slackUserId === row.slackUserId),
      )
      .map((row) =>
        ctx.db
          .update(recipients)
          .set({ remindersSent: row.remindersSent, nextReminderAt: row.nextReminderAt })
          .where(and(eq(recipients.hollerId, id), eq(recipients.slackUserId, row.slackUserId))),
      );
    for (const chunk of chunks(restore)) await runBatch(ctx.db, chunk);
    if (unqueued.length === sends.length) {
      await takeBack(ctx, sent, [
        ctx.db.update(hollers).set({ remindedAt: holler.remindedAt }).where(eq(hollers.id, id)),
      ]);
    }
  });
  return getHoller(ctx, id);
}

/** The tone of the reminder that brought `remindersSent` to its value: 1 gentle, 2 nudge, 3 last. */
export function toneFor(remindersSent: number): ReminderTone {
  const tier = reminderTiers[remindersSent - 1];
  if (!tier) throw new Error(`No reminder tone for ${remindersSent} reminders sent`);
  return tier.tone;
}

/**
 * The cron's pass for scheduled hollers whose time came. A Holler that can no longer go out (a
 * send problem, the monthly limit, nobody to send to) goes back to draft and its creator gets a
 * DM. One that loses a race with another run is skipped. Any other failure, such as Slack being
 * down while resolving a group, leaves it scheduled for the next run and does not stop the rest.
 */
export async function sendDueHollers(env: Bindings, db: Db, now: Date): Promise<string[]> {
  const soon = new Date(now.getTime() + zoneLeadHours * HOUR);
  const due = await db.query.hollers.findMany({
    where: and(eq(hollers.status, "scheduled"), lte(hollers.sendAt, soon)),
  });
  const sent: string[] = [];
  for (const holler of due) {
    const creator = await creatorOf(db, holler);
    const liveAt = goesLiveAt(holler, creator.timeZone);
    if (!liveAt || liveAt > now) continue;
    const ctx: ServiceContext = {
      db,
      workspaceId: holler.workspaceId,
      actor: { via: "system" },
      now: () => now,
    };
    try {
      const loaded = await loadSlackHoller(db, holler.id);
      if (!loaded) continue;
      assertSendable(sendProblems({ ...holler, questions: loaded.holler.questions }, now));
      await assertCanSend(ctx);
      await assertInstalled(db, holler.workspaceId);
      await goLive(ctx, env, holler, creator.timeZone);
      sent.push(holler.id);
    } catch (error) {
      if (error instanceof ServiceError && error.code === "conflict") continue;
      if (!(error instanceof ServiceError)) {
        console.error("scheduled send failed; retrying next run", holler.id, error);
        continue;
      }
      const [failed] = await recordChange(
        ctx,
        activityOf(ctx, {
          action: "holler.send_failed",
          subjectType: "holler",
          subjectId: holler.id,
          data: { code: error.code },
        }),
        db
          .update(hollers)
          .set({ status: "draft", updatedAt: now })
          .where(and(eq(hollers.id, holler.id), eq(hollers.status, "scheduled")))
          .returning({ id: hollers.id }),
      );
      if (!failed) continue;
      await enqueue(env, [
        {
          kind: "send_failed",
          hollerId: holler.id,
          reason: error.message,
          queuedAt: now.toISOString(),
        },
      ]);
    }
  }
  return sent;
}

/** The cron's pass for per-zone sends: claims and invites each person whose local time came. */
export async function queueDueInvites(env: Bindings, db: Db, now: Date): Promise<number> {
  const claimed = await db
    .update(recipients)
    .set({ invitedAt: now })
    .where(
      and(
        isNull(recipients.invitedAt),
        lte(recipients.sendAt, now),
        inArray(
          recipients.hollerId,
          db.select({ id: hollers.id }).from(hollers).where(eq(hollers.status, "live")),
        ),
      ),
    )
    .returning({ hollerId: recipients.hollerId, slackUserId: recipients.slackUserId });
  await queueClaimed(
    env,
    claimed.map((row) => ({ kind: "invite" as const, ...row })),
    (unqueued) => releaseInvites(db, unqueued),
  );
  return claimed.length;
}

/** How long after a send the cron starts retrying an announcement that never posted. */
const announceGraceMinutes = 2;

/**
 * The cron's pass for channel announcements that never posted, because the queue refused them
 * or Slack failed. Queues one for each Holler sent in the last day that has a channel and no
 * announcement yet; the consumer's post key keeps a slow first try from posting twice.
 */
export async function queueMissingAnnouncements(env: Bindings, db: Db, now: Date): Promise<number> {
  const missing = await db
    .select({ id: hollers.id })
    .from(hollers)
    .where(
      and(
        inArray(hollers.status, ["live", "closed"]),
        isNotNull(hollers.announceChannelId),
        isNull(hollers.announceTs),
        lte(hollers.sentAt, new Date(now.getTime() - announceGraceMinutes * 60_000)),
        gte(hollers.sentAt, new Date(now.getTime() - 24 * HOUR)),
      ),
    );
  await enqueue(
    env,
    missing.map((row) => ({ kind: "announce" as const, hollerId: row.id })),
  );
  return missing.length;
}

/** After a response from any door: the thank-you in their DM and the announcement's count. */
export async function queueAfterResponse(
  env: Bindings,
  hollerId: string,
  slackUserId: string,
): Promise<void> {
  await enqueue(env, [
    { kind: "answered", hollerId, slackUserId },
    { kind: "announce", hollerId },
  ]);
}

/** What the Slack builders need about a Holler. Null when it was deleted. */
export async function loadSlackHoller(db: Db, hollerId: string) {
  const row = await db.query.hollers.findFirst({ where: eq(hollers.id, hollerId) });
  if (!row) return null;
  const creator = await db.query.members.findFirst({ where: eq(members.id, row.creatorId) });
  if (!creator) throw new Error(`Holler creator ${row.creatorId} has no member row`);
  const user = await db.query.user.findFirst({ where: eq(schema.user.id, creator.userId) });
  if (!user) throw new Error(`Member ${creator.id} has no user row`);
  const person = await db.query.slackPeople.findFirst({
    where: and(
      eq(slackPeople.workspaceId, row.workspaceId),
      eq(slackPeople.slackUserId, creator.slackUserId),
    ),
  });
  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.hollerId, hollerId))
    .orderBy(questions.position);
  const opts =
    qs.length === 0
      ? []
      : await db
          .select()
          .from(options)
          .where(
            inArray(
              options.questionId,
              // oxlint-disable-next-line holler/bounded-in-array -- a Holler has at most 30 questions
              qs.map((q) => q.id),
            ),
          )
          .orderBy(options.position);
  const presented = qs.map((q) => {
    const own = opts.filter((o) => o.questionId === q.id);
    return {
      ...presentQuestion({ ...q, options: own }),
      otherOptionId: own.find((o) => o.isOther)?.id ?? null,
    };
  });
  const holler: SlackHoller = {
    id: row.id,
    mode: row.mode,
    title: hollerTitle({ mode: row.mode, title: row.title, questions: presented }),
    description: row.description,
    anonymous: row.anonymous,
    externalUrl: row.externalUrl,
    closesAt: row.closesAt,
    // The Slack name people know them by; the sign-in name if the directory has not synced them.
    senderName: person?.displayName || person?.name || user.name,
    questions: presented,
  };
  return { row, holler, creatorSlackUserId: creator.slackUserId };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadSlackHoller>>>;

/**
 * Runs one queued send. It reloads the current state first, so a message that arrives late or
 * twice does the right thing or nothing. A permanent Slack error on a DM is stored on the
 * recipient; any other Slack error is thrown, and the consumer retries it.
 */
export async function deliver(env: Bindings, db: Db, send: SlackSend, now: Date): Promise<void> {
  const loaded = await loadSlackHoller(db, send.hollerId);
  if (!loaded) return;
  const { row, holler } = loaded;
  const slack = await slackFor(env, db, row.workspaceId);

  switch (send.kind) {
    case "invite":
    case "reminder":
      return postToRecipient(env, db, slack, loaded, send, now);
    case "answered":
    case "closed":
      return updateRecipient(db, slack, loaded, send, now);
    case "snoozed":
      return showSnoozed(env, db, slack, loaded, send, now);
    case "announce": {
      if (!row.announceChannelId) return;
      const message = announcementMessage(
        holler,
        await countsFor(db, row.id),
        row.status === "closed",
      );
      if (row.announceTs) {
        await slack.updateMessage({
          channel: row.announceChannelId,
          ts: row.announceTs,
          ...message,
        });
        return;
      }
      const channel = row.announceChannelId;
      const posted = await postOnce(db, postKey(send), now, () =>
        slack.postMessage({ channel, ...message }),
      );
      if (!posted) return;
      await db
        .update(hollers)
        .set({ announceTs: posted.ts })
        .where(and(eq(hollers.id, row.id), isNull(hollers.announceTs)));
      return;
    }
    case "close_notice": {
      const counts = await countsFor(db, row.id);
      await postOnce(db, postKey(send), now, () =>
        slack.postMessage({
          channel: loaded.creatorSlackUserId,
          ...closeNoticeMessage(
            holler,
            counts,
            productUrl(env, "/hollers/$id", { params: { id: row.id } }),
          ),
        }),
      );
      return;
    }
    case "send_failed":
      await postOnce(db, postKey(send), now, () =>
        slack.postMessage({
          channel: loaded.creatorSlackUserId,
          ...sendFailedMessage(
            holler,
            send.reason,
            productUrl(env, "/hollers/$id", { params: { id: row.id } }),
          ),
        }),
      );
      return;
  }
}

async function recipientFor(db: Db, row: Loaded["row"], slackUserId: string) {
  const where = and(eq(recipients.hollerId, row.id), eq(recipients.slackUserId, slackUserId));
  if (!where) throw new Error("unreachable: and() of two conditions");
  const recipient = await db.query.recipients.findFirst({ where });
  const timeZone = await timeZoneOf(db, row.workspaceId, slackUserId);
  return { where, recipient, timeZone };
}

/** An invite or a reminder: a new DM, so it notifies, which becomes the DM to update later. */
/** How this person reads the Holler: their zone, and their own link when it is answered on the web. */
async function readerFor(
  env: Bindings,
  holler: SlackHoller,
  slackUserId: string,
  timeZone: string | null,
  now: Date,
) {
  const respond =
    surfaceOf(holler).where === "web" ? await respondUrl(env, holler.id, slackUserId) : null;
  return { timeZone, now, respondUrl: respond };
}

async function postToRecipient(
  env: Bindings,
  db: Db,
  slack: SlackClient,
  { row, holler }: Loaded,
  send: Extract<SlackSend, { kind: "invite" | "reminder" }>,
  now: Date,
) {
  const { where, recipient, timeZone } = await recipientFor(db, row, send.slackUserId);
  if (!recipient?.invitedAt || recipient.failure || recipient.answeredAt) return;
  if (row.status !== "live") return;
  // A retried invite that already went out has its DM stored.
  if (send.kind === "invite" && recipient.dmTs) return;
  const reader = await readerFor(env, holler, send.slackUserId, timeZone, now);
  const message =
    send.kind === "invite"
      ? inviteMessage(holler, reader)
      : reminderMessage(holler, send.tone, reader);
  const posted = await postOnce(db, postKey(send), now, () =>
    postDm(slack, db, where, { channel: send.slackUserId, ...message }),
  );
  if (!posted) return;
  const next =
    row.remindersEnabled && row.closesAt
      ? nextReminder(
          {
            invitedAt: recipient.invitedAt,
            remindersSent: recipient.remindersSent,
            snoozedUntil: recipient.snoozedUntil,
            closesAt: row.closesAt,
          },
          timeZone,
          now,
        )
      : null;
  await db
    .update(recipients)
    .set({
      dmChannelId: posted.channel,
      dmTs: posted.ts,
      nextReminderAt: next?.dueAt ?? null,
      ...(send.kind === "reminder" ? { lastRemindedAt: now } : {}),
    })
    .where(where);
}

/** A thank-you or the closed line, edited into their latest DM and the one they tapped. */
async function updateRecipient(
  db: Db,
  slack: SlackClient,
  { row, holler }: Loaded,
  send: Extract<SlackSend, { kind: "answered" | "closed" }>,
  now: Date,
) {
  const { recipient, timeZone } = await recipientFor(db, row, send.slackUserId);
  if (!recipient) return;
  const answered = Boolean(recipient.answeredAt);
  if (answered !== (send.kind === "answered")) return;
  const message =
    send.kind === "answered"
      ? answeredMessage(
          holler,
          await answerSummary(db, row, holler, send.slackUserId),
          await noteBoxFor(db, holler, send.responseId),
        )
      : closedMessage(holler, row.closedAt ?? now, { timeZone, now });
  const targets = new Map<string, DmRef>();
  if (recipient.dmChannelId && recipient.dmTs) {
    targets.set(recipient.dmTs, { channel: recipient.dmChannelId, ts: recipient.dmTs });
  }
  if (send.also) targets.set(send.also.ts, send.also);
  for (const target of targets.values()) await slack.updateMessage({ ...target, ...message });
}

/** Rewrites the reminder they snoozed to say when the next one comes. */
async function showSnoozed(
  env: Bindings,
  db: Db,
  slack: SlackClient,
  { row, holler }: Loaded,
  send: Extract<SlackSend, { kind: "snoozed" }>,
  now: Date,
) {
  const { recipient, timeZone } = await recipientFor(db, row, send.slackUserId);
  if (!recipient?.snoozedUntil || recipient.answeredAt || row.status !== "live") return;
  await slack.updateMessage({
    ...send.reminder,
    ...reminderMessage(
      holler,
      toneFor(recipient.remindersSent),
      await readerFor(env, holler, send.slackUserId, timeZone, now),
      recipient.snoozedUntil,
    ),
  });
}

/**
 * Posts once per key: claims the key in `slack_deliveries`, then posts. Null when another
 * delivery of the same send already claimed it. When the post throws, the claim is given back so
 * the consumer's retry can post. A permanent failure that `post` handles itself returns null and
 * keeps the claim.
 */
async function postOnce<T>(db: Db, key: string, now: Date, post: () => Promise<T | null>) {
  if (!(await claimSlackDelivery(db, key, now))) return null;
  try {
    return await post();
  } catch (error) {
    await releaseSlackDelivery(db, key);
    throw error;
  }
}

/** Posts a DM. A permanent failure is stored on the recipient, which stops their reminders. */
async function postDm(slack: SlackClient, db: Db, where: SQL, message: PostMessage) {
  try {
    return await slack.postMessage(message);
  } catch (error) {
    if (!(error instanceof SlackApiError && error.permanent)) throw error;
    await db
      .update(recipients)
      .set({ failure: error.slackError, nextReminderAt: null })
      .where(where);
    return null;
  }
}

/**
 * What a named recipient answered, for their thank-you: the labels they picked, what they wrote,
 * the people they named, their Other text and their note. Nothing on an anonymous one.
 */
async function answerSummary(
  db: Db,
  row: { id: string; anonymous: boolean },
  holler: SlackHoller,
  slackUserId: string,
): Promise<AnswerSummary[]> {
  if (row.anonymous) return [];
  const response = await db.query.responses.findFirst({
    where: and(
      eq(schema.responses.hollerId, row.id),
      eq(schema.responses.slackUserId, slackUserId),
    ),
  });
  if (!response) return [];
  const [given, notes] = await Promise.all([
    db.select().from(schema.answers).where(eq(schema.answers.responseId, response.id)),
    db.select().from(schema.answerNotes).where(eq(schema.answerNotes.responseId, response.id)),
  ]);
  return holler.questions.map((question) => {
    const mine = given.filter((answer) => answer.questionId === question.id);
    const noteOf = (kind: "note" | "other") =>
      notes.find((note) => note.questionId === question.id && note.kind === kind)?.text;
    const other = noteOf("other");
    const values = mine.flatMap((answer) => {
      if (question.type === "person") return [];
      if (answer.text !== null) return [answer.text];
      if (answer.optionId === question.otherOptionId)
        return other ? [`Other: ${other}`] : ["Other"];
      const label = question.options.find((option) => option.id === answer.optionId)?.label;
      return label ? [label] : [];
    });
    return {
      prompt: question.prompt,
      values,
      people: question.type === "person" ? mine.flatMap((answer) => answer.text ?? []) : [],
      note: noteOf("note") ?? null,
    };
  });
}

/**
 * The follow-up note box after a tap in the DM: shown while the picked answer asks for a note and
 * none is written yet. Needs the response id, which only the answer that just happened carries.
 */
async function noteBoxFor(db: Db, holler: SlackHoller, responseId: string | undefined) {
  const question = holler.questions[0];
  if (!responseId || surfaceOf(holler).where !== "dm" || !question?.followUp) return null;
  const [picked, written] = await Promise.all([
    db
      .select()
      .from(schema.answers)
      .where(
        and(eq(schema.answers.responseId, responseId), eq(schema.answers.questionId, question.id)),
      ),
    db
      .select()
      .from(schema.answerNotes)
      .where(
        and(eq(schema.answerNotes.responseId, responseId), eq(schema.answerNotes.kind, "note")),
      ),
  ]);
  if (written.length > 0) return null;
  const { onlyAfter } = question.followUp;
  const asks = picked.some((answer) => {
    const option = question.options.find((o) => o.id === answer.optionId);
    return option && (onlyAfter === null || onlyAfter.includes(option.position));
  });
  return asks ? { responseId, questionId: question.id, prompt: question.followUp.prompt } : null;
}

async function countsFor(db: Db, hollerId: string) {
  const [counts] = await db
    .select({
      recipients: sql<number>`count(*)`,
      answered: sql<number>`count(${recipients.answeredAt})`,
    })
    .from(recipients)
    .where(eq(recipients.hollerId, hollerId));
  return { recipients: Number(counts?.recipients), answered: Number(counts?.answered) };
}
