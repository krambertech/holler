import { and, asc, eq, inArray, isNotNull, isNull, sql } from "@holler/core/db";
import { readInChunks, runBatch } from "../batch";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import { surfaceOf } from "../slack/blocks/format";
import { type HomeLive, type HomeState, homeRowLimit, homeView } from "../slack/blocks/home";
import type { ServiceContext } from "./context";
import { deliver, loadSlackHoller, manualReminderGapHours, type SlackSend } from "./delivery";
import { homeCounts, listHollers } from "./hollers";
import { respondUrl } from "./respond-links";
import { slackFor } from "./slack-connection";

const { slackHomes, members, recipients, hollers, slackPeople } = schema;

const HOUR = 60 * 60 * 1000;

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
  const [reminded, reachable] = await Promise.all([
    readInChunks(ids, (chunk) =>
      ctx.db
        .select({ id: hollers.id, remindedAt: hollers.remindedAt })
        .from(hollers)
        .where(inArray(hollers.id, chunk)),
    ),
    readInChunks(ids, (chunk) =>
      ctx.db
        .select({ hollerId: recipients.hollerId, count: sql<number>`count(*)` })
        .from(recipients)
        .where(
          and(
            inArray(recipients.hollerId, chunk),
            isNull(recipients.answeredAt),
            isNull(recipients.failure),
            isNotNull(recipients.dmTs),
          ),
        )
        .groupBy(recipients.hollerId),
    ),
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

export async function deliverSend(env: Bindings, db: Db, send: SlackSend, now: Date) {
  if (send.kind === "home") return publishHome(env, db, send.workspaceId, send.slackUserId, now);
  return deliver(env, db, send, now);
}
