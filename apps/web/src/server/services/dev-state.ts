import { desc, eq, inArray } from "@holler/core/db";
import { readInChunks } from "../batch";
import { type Db, schema } from "../db";
import { type ServiceContext, ServiceError } from "./context";
import { DEV_TEAM_ID, personas } from "./dev-seed";
import { devSlackRecord, forgetDevSlack } from "./slack-connection";

/**
 * What the verify skill reads back after it drives a screen, so a recipe can prove the stored
 * state agrees with what the page shows. Dev routes only.
 */
export async function devState(ctx: ServiceContext) {
  const workspace = await ctx.db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, ctx.workspaceId),
  });
  if (!workspace) throw new ServiceError("not_found", "That workspace does not exist.");
  const member =
    "memberId" in ctx.actor && ctx.actor.memberId
      ? await ctx.db.query.members.findFirst({ where: eq(schema.members.id, ctx.actor.memberId) })
      : undefined;
  const hollers = await ctx.db.query.hollers.findMany({
    where: eq(schema.hollers.workspaceId, ctx.workspaceId),
    orderBy: desc(schema.hollers.createdAt),
  });
  const recipients = await readInChunks(
    hollers.map((holler) => holler.id),
    (chunk) =>
      ctx.db.select().from(schema.recipients).where(inArray(schema.recipients.hollerId, chunk)),
  );
  const recipientsOf = (hollerId: string) =>
    recipients.filter((recipient) => recipient.hollerId === hollerId);
  const activity = await ctx.db.query.activity.findMany({
    where: eq(schema.activity.workspaceId, ctx.workspaceId),
    orderBy: desc(schema.activity.at),
    limit: 20,
  });
  return {
    workspace: { id: workspace.id, name: workspace.name, plan: workspace.plan },
    persona:
      Object.entries(personas).find(([, p]) => p.slackUserId === member?.slackUserId)?.[0] ?? null,
    member: member ? { id: member.id, slackUserId: member.slackUserId, role: member.role } : null,
    hollers: hollers.map((holler) => {
      const own = recipientsOf(holler.id);
      return {
        id: holler.id,
        title: holler.title,
        status: holler.status,
        closesAt: holler.closesAt?.toISOString() ?? null,
        recipients: own.length,
        answered: own.filter((recipient) => recipient.answeredAt).length,
        waiting: own
          .filter((recipient) => !recipient.answeredAt)
          .map((recipient) => recipient.slackUserId),
      };
    }),
    activity: activity.map((row) => ({
      action: row.action,
      via: row.via,
      subjectId: row.subjectId,
      at: row.at.toISOString(),
    })),
    slack: slackRecord(ctx.workspaceId),
  };
}

/**
 * What the dev FakeSlack sent, newest last: every DM, reminder, announcement and close notice,
 * and every message edited in place. A verify recipe proves a send went out with it.
 */
function slackRecord(workspaceId: string) {
  const fake = devSlackRecord(workspaceId);
  const summary = (message: { channel: string; text: string; ts: string }) => ({
    channel: message.channel,
    ts: message.ts,
    text: message.text,
  });
  return {
    posted: fake?.posted.map(summary) ?? [],
    updated: fake?.updated.map(summary) ?? [],
    modals: fake?.views.length ?? 0,
    views:
      fake?.views.map((opened) => ({
        viewId: opened.viewId,
        callbackId: opened.view.callback_id ?? null,
        privateMetadata: opened.view.private_metadata ?? null,
        text: homeText(opened.view.blocks),
      })) ?? [],
    viewUpdates:
      fake?.viewUpdates.map((update) => ({
        viewId: update.viewId,
        callbackId: update.view.callback_id ?? null,
        text: homeText(update.view.blocks),
      })) ?? [],
    homes:
      fake?.homes.map((home) => ({
        userId: home.userId,
        text: homeText(home.view.blocks),
      })) ?? [],
  };
}

function homeText(blocks: unknown[]): string[] {
  return blocks.flatMap((raw) => {
    const block = raw as {
      text?: { text?: string };
      fields?: { text?: string }[];
      elements?: { text?: string | { text?: string } }[];
    };
    const own = [block.text?.text, ...(block.fields ?? []).map((field) => field.text)];
    const inner = (block.elements ?? []).map((element) =>
      typeof element.text === "string" ? element.text : element.text?.text,
    );
    return [...own, ...inner].filter((text): text is string => Boolean(text));
  });
}

/**
 * Deletes the local dev workspace and everything in it, so the next persona sign-in seeds it
 * again from scratch. Every persona shares it, so this resets all of them. Dev routes only.
 */
export async function resetDevWorkspace(db: Db): Promise<void> {
  const deleted = await db
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.slackTeamId, DEV_TEAM_ID))
    .returning({ id: schema.workspaces.id });
  for (const row of deleted) forgetDevSlack(row.id);
}
