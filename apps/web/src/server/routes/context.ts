import type { Context } from "hono";
import type { AppEnv } from "../app";
import { type ServiceContext, ServiceError } from "../services/context";

/** The service context for a signed-in member, or a 401 the client turns into the sign-in page. */
export function requireMember(c: Context<AppEnv>): ServiceContext {
  const principal = c.get("principal");
  if (!principal) throw new ServiceError("forbidden", "Sign in with Slack to continue.");
  return {
    db: c.get("db"),
    workspaceId: principal.workspaceId,
    actor: principal.actor,
    now: c.get("now"),
  };
}
