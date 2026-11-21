import { and, eq, inArray, isNull, max } from "@holler/core/db";
import { inChunks } from "../batch";
import type { Db } from "../db";
import { schema } from "../db";
import { currentMemberFor, type Scope, scopesOf } from "../principal";
import { auditStatement } from "./audit";
import { memberOf, type ServiceContext, ServiceError } from "./context";

/**
 * Connected apps: the MCP clients a member let in through the consent page. Better Auth owns
 * the consent rows and the tokens; this module reads them for Settings and takes a grant back.
 * A consent's `reference_id` is the member it acts as, so each connection is tied to the
 * workspace the person was in when they approved it.
 */

export interface ConnectedApp {
  /** The consent's id: what Settings revokes. */
  id: string;
  clientId: string;
  name: string | null;
  /** The app's own site, when its registration gave one. */
  uri: string | null;
  scope: Scope;
  connectedAt: string;
  lastUsedAt: string | null;
}

/**
 * The member a new connection acts as: the workspace the person is in when they approve it,
 * by the same rule as their session. The consent keeps it, so the connection never moves.
 */
export async function consentMemberFor(db: Db, userId: string): Promise<string | null> {
  return (await currentMemberFor(db, userId))?.id ?? null;
}

async function userOf(ctx: ServiceContext): Promise<{ userId: string; memberId: string }> {
  const memberId = memberOf(ctx);
  const member = await ctx.db.query.members.findFirst({
    where: and(eq(schema.members.id, memberId), eq(schema.members.workspaceId, ctx.workspaceId)),
  });
  if (!member)
    throw new ServiceError("not_found", "Your membership no longer exists. Sign in again.");
  return { userId: member.userId, memberId };
}

/** The member's connected apps in this workspace, newest first. */
export async function listConnectedApps(ctx: ServiceContext): Promise<ConnectedApp[]> {
  const { userId, memberId } = await userOf(ctx);
  const consents = await ctx.db
    .select({
      id: schema.oauthConsent.id,
      clientId: schema.oauthConsent.clientId,
      scopes: schema.oauthConsent.scopes,
      createdAt: schema.oauthConsent.createdAt,
      name: schema.oauthClient.name,
      uri: schema.oauthClient.uri,
    })
    .from(schema.oauthConsent)
    .leftJoin(schema.oauthClient, eq(schema.oauthClient.clientId, schema.oauthConsent.clientId))
    .where(
      and(eq(schema.oauthConsent.userId, userId), eq(schema.oauthConsent.referenceId, memberId)),
    );
  if (consents.length === 0) return [];
  const used = [];
  for (const chunk of inChunks(consents.map((c) => c.clientId))) {
    used.push(
      ...(await ctx.db
        .select({
          clientId: schema.oauthAccessToken.clientId,
          at: max(schema.oauthAccessToken.createdAt),
        })
        .from(schema.oauthAccessToken)
        .where(
          and(
            eq(schema.oauthAccessToken.userId, userId),
            inArray(schema.oauthAccessToken.clientId, chunk),
          ),
        )
        .groupBy(schema.oauthAccessToken.clientId)),
    );
  }
  const lastUsed = new Map(used.map((row) => [row.clientId, row.at]));
  return consents
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((consent) => ({
      id: consent.id,
      clientId: consent.clientId,
      name: consent.name ?? null,
      uri: consent.uri ?? null,
      scope: scopesOf(consent.scopes).includes("write") ? "write" : "read",
      connectedAt: consent.createdAt.toISOString(),
      lastUsedAt: lastUsed.get(consent.clientId)?.toISOString() ?? null,
    }));
}

/**
 * Disconnects an app: deletes the grant and revokes its tokens. Deleting the consent already
 * stops MCP access, because every request checks it; revoking the tokens also stops refresh.
 */
export async function disconnectApp(ctx: ServiceContext, consentId: string): Promise<void> {
  const { userId, memberId } = await userOf(ctx);
  const consent = await ctx.db.query.oauthConsent.findFirst({
    where: and(
      eq(schema.oauthConsent.id, consentId),
      eq(schema.oauthConsent.userId, userId),
      eq(schema.oauthConsent.referenceId, memberId),
    ),
  });
  if (!consent) throw new ServiceError("not_found", "That app is not connected to your account.");
  const revoked = ctx.now();
  const mine = (table: typeof schema.oauthRefreshToken | typeof schema.oauthAccessToken) =>
    and(
      eq(table.clientId, consent.clientId),
      eq(table.userId, userId),
      eq(table.referenceId, memberId),
      isNull(table.revoked),
    );
  await ctx.db.batch([
    ctx.db.delete(schema.oauthConsent).where(eq(schema.oauthConsent.id, consentId)),
    ctx.db.update(schema.oauthRefreshToken).set({ revoked }).where(mine(schema.oauthRefreshToken)),
    ctx.db.update(schema.oauthAccessToken).set({ revoked }).where(mine(schema.oauthAccessToken)),
    auditStatement(ctx, {
      action: "connected_app.disconnected",
      subjectType: "connected_app",
      subjectId: consent.clientId,
    }),
  ]);
}

/** An app's name for the consent page and Activity, if it registered one. */
export async function clientName(db: Db, clientId: string): Promise<string | null> {
  const client = await db.query.oauthClient.findFirst({
    where: eq(schema.oauthClient.clientId, clientId),
  });
  return client?.name ?? null;
}
