import {
  hollerTitle,
  type ReportOut,
  type SharingOut,
  type ViewersInput,
  viewersInputSchema,
  withoutNames,
} from "@holler/core";
import { and, eq, gte, inArray, isNull, not, sql } from "@holler/core/db";
import { batchResults, runBatch } from "../batch";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import { auditStatement, auditUnless } from "./audit";
import { type ServiceContext, ServiceError } from "./context";
import { queueClaimed, type SlackSend } from "./delivery";
import { getHoller, type HollerDetail } from "./hollers";
import { resultsFor } from "./responses";

const { hollers, viewers, slackPeople, members, recipients, workspaces } = schema;

type LinkEnv = Pick<Bindings, "PRODUCT_URL">;
type QueueEnv = Pick<Bindings, "SLACK_SENDS">;

const notifyCatchUpHours = 24;
const HOUR = 60 * 60 * 1000;

function requireCreator(holler: HollerDetail, doing: string) {
  if (!holler.isCreator) {
    throw new ServiceError("forbidden", `Only the person who wrote this Holler can ${doing}.`);
  }
}

async function creatorsHoller(ctx: ServiceContext, id: string, doing: string) {
  const holler = await getHoller(ctx, id);
  requireCreator(holler, doing);
  return holler;
}

function viewerExists(hollerId: string, slackUserId: string) {
  return sql`exists (select 1 from viewers v where v.holler_id = ${hollerId} and v.slack_user_id = ${slackUserId})`;
}

function hasReportLink(hollerId: string) {
  return sql`exists (select 1 from hollers h where h.id = ${hollerId} and h.report_token is not null)`;
}

export function reportUrl(env: LinkEnv, token: string): string {
  return `${env.PRODUCT_URL}/report/${token}`;
}

function newReportToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export async function getSharing(ctx: ServiceContext, env: LinkEnv, id: string) {
  const holler = await creatorsHoller(ctx, id, "see who it is shared with");
  return sharingOf(ctx, env, holler.id);
}

async function sharingOf(ctx: ServiceContext, env: LinkEnv, id: string): Promise<SharingOut> {
  const row = await ctx.db.query.hollers.findFirst({
    where: and(eq(hollers.id, id), eq(hollers.workspaceId, ctx.workspaceId)),
    columns: { visibility: true, reportToken: true },
  });
  if (!row) throw new ServiceError("not_found", "That Holler does not exist.");
  const list = await ctx.db
    .select({
      slackUserId: viewers.slackUserId,
      addedAt: viewers.addedAt,
      name: slackPeople.name,
      displayName: slackPeople.displayName,
      avatarUrl: slackPeople.avatarUrl,
      memberId: members.id,
    })
    .from(viewers)
    .leftJoin(
      slackPeople,
      and(
        eq(slackPeople.workspaceId, ctx.workspaceId),
        eq(slackPeople.slackUserId, viewers.slackUserId),
      ),
    )
    .leftJoin(
      members,
      and(eq(members.workspaceId, ctx.workspaceId), eq(members.slackUserId, viewers.slackUserId)),
    )
    .where(eq(viewers.hollerId, id))
    .orderBy(viewers.addedAt, viewers.slackUserId);
  return {
    visibility: row.visibility,
    viewers: list.map((v) => ({
      slackUserId: v.slackUserId,
      name: v.displayName || v.name || v.slackUserId,
      avatarUrl: v.avatarUrl ?? null,
      member: v.memberId != null,
      addedAt: v.addedAt.toISOString(),
    })),
    reportUrl: row.reportToken ? reportUrl(env, row.reportToken) : null,
  };
}

export async function setVisibility(
  ctx: ServiceContext,
  env: LinkEnv,
  id: string,
  visibility: "private" | "workspace",
): Promise<SharingOut> {
  const holler = await creatorsHoller(ctx, id, "change who sees it");
  if (holler.visibility !== visibility) {
    await ctx.db.batch([
      ctx.db
        .update(hollers)
        .set({ visibility, updatedAt: ctx.now() })
        .where(eq(hollers.id, holler.id)),
      auditStatement(ctx, {
        action: "holler.visibility_changed",
        subjectType: "holler",
        subjectId: holler.id,
        data: { visibility },
      }),
    ]);
  }
  return sharingOf(ctx, env, holler.id);
}

export async function addViewers(
  ctx: ServiceContext,
  env: LinkEnv & QueueEnv,
  id: string,
  input: ViewersInput,
): Promise<SharingOut> {
  const { slackUserIds } = viewersInputSchema.parse(input);
  const holler = await creatorsHoller(ctx, id, "share it");
  if (holler.status === "draft") {
    throw new ServiceError("invalid", "Share a Holler once it is sent or scheduled.");
  }
  const self = "slackUserId" in ctx.actor ? ctx.actor.slackUserId : null;
  const wanted = [...new Set(slackUserIds)].filter((u) => u !== self);
  if (wanted.length === 0) return sharingOf(ctx, env, holler.id);

  const people = await ctx.db
    .select({ slackUserId: slackPeople.slackUserId })
    .from(slackPeople)
    .where(
      and(
        eq(slackPeople.workspaceId, ctx.workspaceId),
        eq(slackPeople.isBot, false),
        eq(slackPeople.isDeleted, false),
        inArray(slackPeople.slackUserId, wanted),
      ),
    );
  const known = new Set(people.map((p) => p.slackUserId));
  if (wanted.some((u) => !known.has(u))) {
    throw new ServiceError(
      "invalid",
      "Someone you chose is not in this workspace's Slack. Choose them again from the list.",
      "slackUserIds",
    );
  }
  const now = ctx.now();
  const memberId = "memberId" in ctx.actor ? ctx.actor.memberId : undefined;
  if (!memberId) throw new ServiceError("forbidden", "This needs a signed-in member.");
  const perViewer = wanted.map((slackUserId) => [
    ...auditUnless(
      ctx,
      {
        action: "viewer.added",
        subjectType: "holler",
        subjectId: holler.id,
        data: { slackUserId },
      },
      viewerExists(holler.id, slackUserId),
    ),
    ctx.db
      .insert(viewers)
      .values({
        hollerId: holler.id,
        slackUserId,
        addedById: memberId,
        addedAt: now,
        notifiedAt: now,
      })
      .onConflictDoNothing()
      .returning({ slackUserId: viewers.slackUserId }),
  ]);
  const results = await batchResults(ctx.db, perViewer.flat());
  const statementsPerViewer = perViewer[0]?.length ?? 0;
  const added = wanted.filter((_, index) => {
    const inserted = results[index * statementsPerViewer + statementsPerViewer - 1];
    return Array.isArray(inserted) && inserted.length > 0;
  });
  if (added.length === 0) return sharingOf(ctx, env, holler.id);
  const sends: SlackSend[] = added.map((slackUserId) => ({
    kind: "shared",
    hollerId: holler.id,
    slackUserId,
    queuedAt: now.toISOString(),
  }));
  try {
    await queueClaimed(env as Bindings, sends, (unqueued) => releaseShares(ctx.db, unqueued, now));
  } catch (error) {
    console.error("share DMs not queued; the cron will retry", holler.id, error);
  }
  return sharingOf(ctx, env, holler.id);
}

async function releaseShares(db: Db, unqueued: SlackSend[], claimedAt: Date) {
  await runBatch(
    db,
    unqueued.flatMap((send) =>
      send.kind === "shared"
        ? [
            db
              .update(viewers)
              .set({ notifiedAt: null })
              .where(
                and(
                  eq(viewers.hollerId, send.hollerId),
                  eq(viewers.slackUserId, send.slackUserId),
                  eq(viewers.notifiedAt, claimedAt),
                ),
              ),
          ]
        : [],
    ),
  );
}

export async function removeViewer(
  ctx: ServiceContext,
  env: LinkEnv,
  id: string,
  slackUserId: string,
): Promise<SharingOut> {
  const holler = await creatorsHoller(ctx, id, "change who sees it");
  await runBatch(ctx.db, [
    ...auditUnless(
      ctx,
      {
        action: "viewer.removed",
        subjectType: "holler",
        subjectId: holler.id,
        data: { slackUserId },
      },
      not(viewerExists(holler.id, slackUserId)),
    ),
    ctx.db
      .delete(viewers)
      .where(and(eq(viewers.hollerId, holler.id), eq(viewers.slackUserId, slackUserId))),
  ]);
  return sharingOf(ctx, env, holler.id);
}

export async function makeReportLink(
  ctx: ServiceContext,
  env: LinkEnv,
  id: string,
): Promise<SharingOut> {
  const holler = await creatorsHoller(ctx, id, "make a report link for it");
  if (holler.status !== "live" && holler.status !== "closed") {
    throw new ServiceError("invalid", "A report link can be made once the Holler is sent.");
  }
  if (!holler.reportToken) {
    await runBatch(ctx.db, [
      ...auditUnless(
        ctx,
        { action: "report_link.made", subjectType: "holler", subjectId: holler.id },
        hasReportLink(holler.id),
      ),
      ctx.db
        .update(hollers)
        .set({ reportToken: newReportToken() })
        .where(and(eq(hollers.id, holler.id), isNull(hollers.reportToken))),
    ]);
  }
  return sharingOf(ctx, env, holler.id);
}

export async function turnOffReportLink(
  ctx: ServiceContext,
  env: LinkEnv,
  id: string,
): Promise<SharingOut> {
  const holler = await creatorsHoller(ctx, id, "turn off its report link");
  if (holler.reportToken) {
    await runBatch(ctx.db, [
      ...auditUnless(
        ctx,
        { action: "report_link.turned_off", subjectType: "holler", subjectId: holler.id },
        not(hasReportLink(holler.id)),
      ),
      ctx.db.update(hollers).set({ reportToken: null }).where(eq(hollers.id, holler.id)),
    ]);
  }
  return sharingOf(ctx, env, holler.id);
}

export async function getReport(db: Db, token: string, now: Date): Promise<ReportOut> {
  const gone = new ServiceError(
    "not_found",
    "This report link does not open anything. It may have been turned off; ask whoever sent it.",
  );
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw gone;
  const [row] = await db
    .select({ holler: hollers, workspaceName: workspaces.name })
    .from(hollers)
    .innerJoin(workspaces, eq(workspaces.id, hollers.workspaceId))
    .where(and(eq(hollers.reportToken, token), inArray(hollers.status, ["live", "closed"])));
  if (!row) throw gone;
  const { holler } = row;
  const ctx: ServiceContext = {
    db,
    workspaceId: holler.workspaceId,
    actor: { via: "system" },
    now: () => now,
  };
  const [counts] = await db
    .select({
      recipientCount: sql<number>`count(*)`,
      answeredCount: sql<number>`count(${recipients.answeredAt})`,
    })
    .from(recipients)
    .where(eq(recipients.hollerId, holler.id));
  const results = withoutNames(await resultsFor(ctx, holler.id));
  const prompts = await db
    .select({ prompt: schema.questions.prompt })
    .from(schema.questions)
    .where(eq(schema.questions.hollerId, holler.id))
    .orderBy(schema.questions.position)
    .limit(1);
  return {
    title: hollerTitle({ ...holler, questions: prompts }) || "Untitled",
    mode: holler.mode,
    anonymous: holler.anonymous,
    status: holler.status === "closed" ? "closed" : "live",
    workspaceName: row.workspaceName,
    sentAt: holler.sentAt?.toISOString() ?? null,
    closedAt: holler.closedAt?.toISOString() ?? null,
    recipientCount: Number(counts?.recipientCount ?? 0),
    answeredCount: Number(counts?.answeredCount ?? 0),
    results,
  };
}

export async function queueShareNotices(env: QueueEnv, db: Db, now: Date): Promise<number> {
  const due = await db
    .select({ hollerId: viewers.hollerId, slackUserId: viewers.slackUserId })
    .from(viewers)
    .where(
      and(
        isNull(viewers.notifiedAt),
        gte(viewers.addedAt, new Date(now.getTime() - notifyCatchUpHours * HOUR)),
      ),
    )
    .limit(500);
  let queued = 0;
  for (const viewer of due) {
    const [claimed] = await db
      .update(viewers)
      .set({ notifiedAt: now })
      .where(
        and(
          eq(viewers.hollerId, viewer.hollerId),
          eq(viewers.slackUserId, viewer.slackUserId),
          isNull(viewers.notifiedAt),
        ),
      )
      .returning({ hollerId: viewers.hollerId });
    if (!claimed) continue;
    const send: SlackSend = { kind: "shared", ...viewer, queuedAt: now.toISOString() };
    await queueClaimed(env as Bindings, [send], (unqueued) => releaseShares(db, unqueued, now));
    queued += 1;
  }
  return queued;
}
