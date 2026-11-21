import { desc, eq, inArray } from "@holler/core/db";
import { type Db, schema } from "../db";
import { type ServiceContext, ServiceError } from "./context";
import { DEV_TEAM_ID, personas } from "./dev-seed";

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
  const recipients =
    hollers.length === 0
      ? []
      : await ctx.db
          .select()
          .from(schema.recipients)
          .where(
            inArray(
              schema.recipients.hollerId,
              hollers.map((holler) => holler.id),
            ),
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
  };
}

/**
 * Deletes the local dev workspace and everything in it, so the next persona sign-in seeds it
 * again from scratch. Every persona shares it, so this resets all of them. Dev routes only.
 */
export async function resetDevWorkspace(db: Db): Promise<void> {
  await db.delete(schema.workspaces).where(eq(schema.workspaces.slackTeamId, DEV_TEAM_ID));
}
