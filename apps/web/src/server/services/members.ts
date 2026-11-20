import { and, eq } from "@holler/core/db";
import { schema } from "../db";
import { memberOf, type ServiceContext, ServiceError } from "./context";

/** What the header and Settings show about the signed-in member and their workspace. */
export async function describeMe(ctx: ServiceContext) {
  const memberId = memberOf(ctx);
  const [row] = await ctx.db
    .select({
      member: schema.members,
      workspace: schema.workspaces,
      person: schema.slackPeople,
    })
    .from(schema.members)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.members.workspaceId))
    .leftJoin(
      schema.slackPeople,
      and(
        eq(schema.slackPeople.workspaceId, schema.members.workspaceId),
        eq(schema.slackPeople.slackUserId, schema.members.slackUserId),
      ),
    )
    .where(eq(schema.members.id, memberId));
  if (!row) throw new ServiceError("not_found", "Your membership no longer exists. Sign in again.");
  return {
    member: {
      id: row.member.id,
      role: row.member.role,
      slackUserId: row.member.slackUserId,
      name: row.person?.displayName || row.person?.name || "You",
      avatarUrl: row.person?.avatarUrl ?? null,
    },
    workspace: {
      id: row.workspace.id,
      name: row.workspace.name,
      iconUrl: row.workspace.iconUrl,
      slackDomain: row.workspace.slackDomain,
      installed: row.workspace.uninstalledAt == null,
    },
  };
}
