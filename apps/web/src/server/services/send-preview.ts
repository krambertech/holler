import type { SendPreview } from "@holler/core";
import { and, eq, inArray, sql } from "@holler/core/db";
import { inChunks } from "../batch";
import { schema } from "../db";
import { hmacSha256, timingSafeEqual } from "../hmac";
import { type ServiceContext, ServiceError } from "./context";
import { getHoller } from "./hollers";

/**
 * What a send would do, shown before it happens. MCP sends in two steps: the first call
 * returns this preview and a confirm token, and only a second call with the token sends. A send
 * reaches real people and cannot be undone, and an assistant's generic "allow this tool?"
 * prompt does not say who it reaches.
 *
 * The audience is counted from Holler's copy of the Slack directory, so a group's size is
 * the size Slack last reported. The send itself resolves the exact people.
 */

export const PREVIEW_NAME_LIMIT = 10;
const TOKEN_LIFETIME_MS = 10 * 60_000;

/** The shape is `sendPreviewOutSchema` in core, so the web app, the API and MCP read the same. */
export async function previewSend(ctx: ServiceContext, id: string): Promise<SendPreview> {
  const holler = await getHoller(ctx, id);
  if (!holler.isCreator) {
    throw new ServiceError("forbidden", "Only the person who made this Holler can send it.");
  }
  if (holler.status === "live" || holler.status === "closed") {
    throw new ServiceError("conflict", "This Holler is already sent.");
  }
  const { audience } = holler;
  const people =
    audience.people.length === 0
      ? []
      : await ctx.db
          .select({ slackUserId: schema.slackPeople.slackUserId, name: schema.slackPeople.name })
          .from(schema.slackPeople)
          .where(
            and(
              eq(schema.slackPeople.workspaceId, ctx.workspaceId),
              inArray(schema.slackPeople.slackUserId, audience.people.slice(0, PREVIEW_NAME_LIMIT)),
            ),
          );
  const nameOf = new Map(people.map((p) => [p.slackUserId, p.name]));
  const groups: { name: string; kind: "usergroup" | "channel"; memberCount: number | null }[] = [];
  for (const chunk of inChunks(audience.groups)) {
    groups.push(
      ...(await ctx.db
        .select({
          name: schema.slackGroups.name,
          kind: schema.slackGroups.kind,
          memberCount: schema.slackGroups.memberCount,
        })
        .from(schema.slackGroups)
        .where(
          and(
            eq(schema.slackGroups.workspaceId, ctx.workspaceId),
            inArray(schema.slackGroups.slackId, chunk),
          ),
        )),
    );
  }
  let reach = audience.people.length + groups.reduce((sum, g) => sum + (g.memberCount ?? 0), 0);
  if (audience.everyone) {
    const [row] = await ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(schema.slackPeople)
      .where(
        and(
          eq(schema.slackPeople.workspaceId, ctx.workspaceId),
          eq(schema.slackPeople.isBot, false),
          eq(schema.slackPeople.isDeleted, false),
        ),
      );
    reach = Number(row?.n ?? 0);
  }
  const start = holler.sendAt ?? ctx.now();
  const closesAt =
    holler.closesAt ?? new Date(start.getTime() + holler.closeAfterHours * 3_600_000);
  return {
    hollerId: holler.id,
    title: holler.displayTitle,
    reach,
    people: audience.people
      .slice(0, PREVIEW_NAME_LIMIT)
      .map((slackUserId) => nameOf.get(slackUserId) ?? slackUserId),
    morePeople: Math.max(0, audience.people.length - PREVIEW_NAME_LIMIT),
    groups,
    everyone: audience.everyone,
    anonymous: holler.anonymous,
    sendAt: holler.sendAt?.toISOString() ?? null,
    closesAt: closesAt.toISOString(),
    problems: holler.problems,
  };
}

/**
 * A confirm token for this version of the Holler. It names the Holler, the member and the
 * Holler's last change, so it cannot send another Holler, and any edit after the preview
 * makes it stale. It expires after ten minutes.
 */
export async function sendConfirmToken(
  ctx: ServiceContext,
  secret: string,
  id: string,
): Promise<string> {
  const holler = await getHoller(ctx, id);
  const expires = ctx.now().getTime() + TOKEN_LIFETIME_MS;
  const signature = await sign(secret, payload(ctx, holler.id, holler.updatedAt, expires));
  return `${expires}.${signature}`;
}

/** Throws unless the token was made for this Holler, as it is now, by this member, and is fresh. */
export async function checkSendConfirmToken(
  ctx: ServiceContext,
  secret: string,
  id: string,
  token: string,
): Promise<void> {
  const holler = await getHoller(ctx, id);
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  const stale = new ServiceError(
    "conflict",
    "That confirmation is out of date. Preview the send again, check who it reaches, then confirm.",
    "confirm",
  );
  if (!signature || !Number.isFinite(expires) || expires < ctx.now().getTime()) throw stale;
  const expected = await sign(secret, payload(ctx, holler.id, holler.updatedAt, expires));
  if (!timingSafeEqual(expected, signature)) throw stale;
}

function payload(ctx: ServiceContext, id: string, updatedAt: Date, expires: number): string {
  const member = "memberId" in ctx.actor ? ctx.actor.memberId : "";
  return `send:${ctx.workspaceId}:${member}:${id}:${updatedAt.getTime()}:${expires}`;
}

async function sign(secret: string, message: string): Promise<string> {
  const mac = await hmacSha256(secret, message);
  return btoa(String.fromCharCode(...mac))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
