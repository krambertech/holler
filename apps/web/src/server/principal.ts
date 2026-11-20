import { and, eq } from "@holler/core/db";
import type { Auth } from "./auth";
import { type Db, schema } from "./db";
import type { Actor } from "./services/context";

export interface Principal {
  userId: string;
  memberId: string;
  workspaceId: string;
  slackUserId: string;
  role: "owner" | "sender";
  actor: Actor;
}

/**
 * Who is calling, from the session cookie. API keys and MCP tokens resolve here too once those
 * doors exist, each producing an actor with its own `via`. Null when nobody is signed in or the
 * user has no member row yet (signed in with Slack but the workspace has not installed Holler).
 */
export async function principalFor(
  auth: Auth,
  db: Db,
  request: Request,
): Promise<Principal | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const member = await db.query.members.findFirst({
    where: and(eq(schema.members.userId, session.user.id)),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });
  if (!member) return null;
  return {
    userId: session.user.id,
    memberId: member.id,
    workspaceId: member.workspaceId,
    slackUserId: member.slackUserId,
    role: member.role,
    actor: { via: "web", memberId: member.id, slackUserId: member.slackUserId },
  };
}
