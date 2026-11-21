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

const { slackHomes, members, recipients, hollers, slackPeople } = schema;

const HOUR = 60 * 60 * 1000;
export const homeDebounceSeconds = 5;
export const homeClaimStaleMs = 60_000;
const CLAIM_CHUNK = 90;

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

export async function senderState(ctx: ServiceContext, now: Date) {
  const [counts, live] = await Promise.all([
    homeCounts(ctx),
    listHollers(ctx, { scope: "mine", status: "live" }),
  ]);
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
  if (!workspace || workspace.uninstalledAt) return;
  const slack = await slackFor(env, db, workspaceId);
  const view = homeView(await homeState(env, db, workspaceId, slackUserId, now));
  await slack.publishHome({ userId: slackUserId, view });
  await runBatch(db, [db.update(slackHomes).set({ publishedAt: now }).where(where)]);
}
