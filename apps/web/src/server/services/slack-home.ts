import { and, asc, eq, inArray, isNotNull, isNull, lte, or, sql } from "@holler/core/db";
import { runBatch } from "../batch";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import { surfaceOf } from "../slack/blocks/format";
import { type HomeLive, type HomeState, homeRowLimit, homeView } from "../slack/blocks/home";
import type { ServiceContext } from "./context";
import { loadSlackHoller, manualReminderGapHours, queueClaimed, type SlackSend } from "./delivery";
import { homeCounts, listHollers } from "./hollers";
import { respondUrl } from "./respond-links";
import { slackFor } from "./slack-connection";

/**
 * App Home: what is waiting on a person and, for a member, what they sent. Every publish builds
 * the Home from the current state, so publishing late or twice is never wrong. A change queues a
 * publish for the people it affects, claimed in `slack_homes` so a burst of answers publishes
 * once, and only for people who opened their Home before. docs/slack.md, App Home.
 */

const { slackHomes, members, recipients, hollers, slackPeople } = schema;

const HOUR = 60 * 60 * 1000;
/** A publish waits this long, so the changes that follow it ride along. */
export const homeDebounceSeconds = 5;
/** A claim older than this is taken again, in case its publish was lost. */
export const homeClaimStaleMs = 60_000;
/** Slack user ids per claim statement, inside D1's 100 bound values. */
const CLAIM_CHUNK = 90;

/**
 * The member a Slack user is, as a service context for sending from Slack, or null when they have
 * not signed in to Holler. Every door calls the same services, so the rules hold from Slack too.
 */
export async function slackSenderContext(
  base: Omit<ServiceContext, "actor">,
  slackUserId: string,
): Promise<ServiceContext | null> {
  const member = await base.db.query.members.findFirst({
    where: and(eq(members.workspaceId, base.workspaceId), eq(members.slackUserId, slackUserId)),
    columns: { id: true },
  });
  if (!member) return null;
  return { ...base, actor: { via: "slack", memberId: member.id, slackUserId } };
}

export async function timeZoneFor(db: Db, workspaceId: string, slackUserId: string) {
  const person = await db.query.slackPeople.findFirst({
    where: and(eq(slackPeople.workspaceId, workspaceId), eq(slackPeople.slackUserId, slackUserId)),
    columns: { timeZone: true },
  });
  return person?.timeZone ?? null;
}

/** Everything one person's Home shows, read fresh. */
export async function homeState(
  env: Bindings,
  db: Db,
  workspaceId: string,
  slackUserId: string,
  now: Date,
): Promise<HomeState> {
  const ctx = await slackSenderContext({ db, workspaceId, now: () => now }, slackUserId);
  const [timeZone, sender, waiting] = await Promise.all([
    timeZoneFor(db, workspaceId, slackUserId),
    ctx ? senderState(ctx, now) : null,
    waitingOn(env, db, workspaceId, slackUserId),
  ]);
  return {
    sender,
    waiting: waiting.rows,
    moreWaiting: waiting.more,
    timeZone,
    now,
    productUrl: env.PRODUCT_URL,
  };
}

/** A member's three numbers and live hollers, for App Home and `/holler results`. */
export async function senderState(ctx: ServiceContext, now: Date) {
  const [counts, live] = await Promise.all([
    homeCounts(ctx),
    listHollers(ctx, { scope: "mine", status: "live" }),
  ]);
  // Soonest to close first: that is the one to chase.
  live.sort((a, b) => (a.closesAt ?? "").localeCompare(b.closesAt ?? ""));
  const shown = live.slice(0, homeRowLimit);
  const ids = shown.map((row) => row.id);
  const [reminded, reachable] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          ctx.db
            .select({ id: hollers.id, remindedAt: hollers.remindedAt })
            .from(hollers)
            .where(inArray(hollers.id, ids)),
          // Who Send reminder would reach: the same people remindWaiting reminds.
          ctx.db
            .select({ hollerId: recipients.hollerId, count: sql<number>`count(*)` })
            .from(recipients)
            .where(
              and(
                inArray(recipients.hollerId, ids),
                isNull(recipients.answeredAt),
                isNull(recipients.failure),
                isNotNull(recipients.dmTs),
              ),
            )
            .groupBy(recipients.hollerId),
        ]);
  const gap = manualReminderGapHours * HOUR;
  const rows: HomeLive[] = shown.map((row) => {
    const last = reminded.find((r) => r.id === row.id)?.remindedAt ?? null;
    const waiting = Number(reachable.find((r) => r.hollerId === row.id)?.count ?? 0);
    const remind: HomeLive["remind"] =
      last && now.getTime() - last.getTime() < gap
        ? { status: "wait", last, next: new Date(last.getTime() + gap) }
        : waiting > 0
          ? { status: "ready" }
          : { status: "nobody" };
    return {
      id: row.id,
      title: row.title,
      answered: row.answeredCount,
      recipients: row.recipientCount,
      closesAt: row.closesAt ? new Date(row.closesAt) : null,
      remind,
    };
  });
  return { counts, live: rows, moreLive: live.length - shown.length };
}

/** Live hollers this person got and has not answered, soonest to close first. */
async function waitingOn(env: Bindings, db: Db, workspaceId: string, slackUserId: string) {
  const rows = await db
    .select({ hollerId: recipients.hollerId })
    .from(recipients)
    .innerJoin(hollers, eq(hollers.id, recipients.hollerId))
    .where(
      and(
        eq(hollers.workspaceId, workspaceId),
        eq(hollers.status, "live"),
        eq(recipients.slackUserId, slackUserId),
        isNotNull(recipients.invitedAt),
        isNull(recipients.answeredAt),
        isNull(recipients.failure),
      ),
    )
    .orderBy(asc(hollers.closesAt));
  const shown = rows.slice(0, homeRowLimit);
  const loaded = await Promise.all(shown.map((row) => loadSlackHoller(db, row.hollerId)));
  const waiting = await Promise.all(
    loaded
      .flatMap((one) => (one ? [one.holler] : []))
      .map(async (holler) => ({
        holler,
        respondUrl:
          surfaceOf(holler).where === "web" ? await respondUrl(env, holler.id, slackUserId) : null,
      })),
  );
  return { rows: waiting, more: rows.length - shown.length };
}

/** app_home_opened: remembers that this person has a Home, so later changes publish to it. */
export async function markHomeOpened(
  db: Db,
  workspaceId: string,
  slackUserId: string,
  now: Date,
): Promise<void> {
  await db
    .insert(slackHomes)
    .values({ workspaceId, slackUserId, openedAt: now })
    .onConflictDoUpdate({
      target: [slackHomes.workspaceId, slackHomes.slackUserId],
      set: { openedAt: now },
    });
}

/**
 * Queues a fresh Home for each of these people who has one. A person whose publish is already on
 * its way is skipped, so ten answers in a row publish once; a claim older than a minute is taken
 * again, in case that publish was lost. `soon` skips the wait and the skip, for a Home the person
 * is looking at right now. When the queue refuses, the claims go back.
 */
export async function queueHomes(
  env: Bindings,
  db: Db,
  workspaceId: string,
  slackUserIds: string[],
  now: Date,
  options: { soon?: boolean } = {},
): Promise<number> {
  const people = [...new Set(slackUserIds)];
  const stale = new Date(now.getTime() - homeClaimStaleMs);
  const claimed: string[] = [];
  for (let start = 0; start < people.length; start += CLAIM_CHUNK) {
    const chunk = people.slice(start, start + CLAIM_CHUNK);
    const rows = await db
      .update(slackHomes)
      .set({ queuedAt: now })
      .where(
        and(
          eq(slackHomes.workspaceId, workspaceId),
          inArray(slackHomes.slackUserId, chunk),
          options.soon
            ? undefined
            : or(isNull(slackHomes.queuedAt), lte(slackHomes.queuedAt, stale)),
        ),
      )
      .returning({ slackUserId: slackHomes.slackUserId });
    claimed.push(...rows.map((row) => row.slackUserId));
  }
  const sends: SlackSend[] = claimed.map((slackUserId) => ({
    kind: "home",
    workspaceId,
    slackUserId,
  }));
  await queueClaimed(
    env,
    sends,
    async (unqueued) => {
      const back = unqueued.flatMap((send) => (send.kind === "home" ? [send.slackUserId] : []));
      for (let start = 0; start < back.length; start += CLAIM_CHUNK) {
        await db
          .update(slackHomes)
          .set({ queuedAt: null })
          .where(
            and(
              eq(slackHomes.workspaceId, workspaceId),
              inArray(slackHomes.slackUserId, back.slice(start, start + CLAIM_CHUNK)),
            ),
          );
      }
    },
    options.soon ? {} : { delaySeconds: homeDebounceSeconds },
  );
  return claimed.length;
}

/**
 * Best effort: a Home that misses a change is put right the next time it opens, so a failure
 * here never fails the send, answer or close that caused it.
 */
export async function refreshHomes(
  env: Bindings,
  db: Db,
  workspaceId: string,
  slackUserIds: string[],
  now: Date,
  options: { soon?: boolean } = {},
): Promise<void> {
  try {
    await queueHomes(env, db, workspaceId, slackUserIds, now, options);
  } catch (error) {
    console.error("Home refresh not queued; it is rebuilt when opened", error);
  }
}

/**
 * Publishes one person's Home: the claim is cleared first, so any change from here on queues
 * another publish, then the Home is built from the state as it is now.
 */
export async function publishHome(
  env: Bindings,
  db: Db,
  workspaceId: string,
  slackUserId: string,
  now: Date,
): Promise<void> {
  const where = and(
    eq(slackHomes.workspaceId, workspaceId),
    eq(slackHomes.slackUserId, slackUserId),
  );
  await db.update(slackHomes).set({ queuedAt: null }).where(where);
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
    columns: { uninstalledAt: true },
  });
  // Deleted, or out of Slack: there is no Home to publish to.
  if (!workspace || workspace.uninstalledAt) return;
  const slack = await slackFor(env, db, workspaceId);
  const view = homeView(await homeState(env, db, workspaceId, slackUserId, now));
  await slack.publishHome({ userId: slackUserId, view });
  await runBatch(db, [db.update(slackHomes).set({ publishedAt: now }).where(where)]);
}
