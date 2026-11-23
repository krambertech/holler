import type { Db } from "../db";

export type Actor =
  | { via: "web" | "slack"; memberId: string; slackUserId: string }
  | { via: "api" | "mcp"; memberId: string; slackUserId: string; credentialId: string }
  /** Cron, the queue, and Slack events no member caused. */
  | { via: "system" }
  /** A recipient answering in Slack or on the web. They have no member row. */
  | { via: "slack" | "web"; recipientSlackUserId: string; memberId?: undefined };

/**
 * What every service function takes first. Routes, Slack handlers and MCP tools build one and
 * never reach the database themselves; Oxlint refuses a Drizzle import outside services.
 */
export interface ServiceContext {
  db: Db;
  workspaceId: string;
  actor: Actor;
  /** Injected so tests can fix time. */
  now: () => Date;
}

export function memberOf(ctx: ServiceContext): string {
  if (!("memberId" in ctx.actor) || !ctx.actor.memberId) {
    throw new ServiceError("forbidden", "This needs a signed-in member.");
  }
  return ctx.actor.memberId;
}

export type ServiceErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid"
  | "conflict"
  | "limit_reached"
  | "closed"
  | "slack_unavailable";

const statusFor: Record<ServiceErrorCode, 400 | 403 | 404 | 409 | 402 | 410 | 503> = {
  not_found: 404,
  forbidden: 403,
  invalid: 400,
  conflict: 409,
  limit_reached: 402,
  closed: 410,
  slack_unavailable: 503,
};

/**
 * The one error a service throws on purpose. The message is written for the person who will
 * read it: plain, and saying what to do next. `field` names the input at fault, so a form can
 * put the message beside it.
 */
export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
    readonly field?: string,
    /** Every problem at once, when there are several, such as a send with three fields to fix. */
    readonly problems?: { message: string; field: string | null }[],
  ) {
    super(message);
    this.name = "ServiceError";
  }

  get status() {
    return statusFor[this.code];
  }
}
