import type { Context } from "hono";
import type { AppEnv } from "../app";
import { type ServiceContext, ServiceError } from "../services/context";

/**
 * The service context for the member behind the request: a session in the web app, or an API key
 * under /api/v1. With no caller it throws `forbidden`, a 403 the web client turns into the
 * sign-in page. /api/v1 answers 401 itself before a route runs, so there it never throws.
 */
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
