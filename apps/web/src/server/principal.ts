import { and, eq } from "@holler/core/db";
import type { Auth } from "./auth";
import { type Db, schema } from "./db";
import type { Actor } from "./services/context";
import { latestSlackClaims } from "./services/members";

export type Scope = "read" | "write";

export interface Principal {
  userId: string;
  memberId: string;
  workspaceId: string;
  slackUserId: string;
  role: "owner" | "sender";
  actor: Actor;
  scope: Scope;
}

export interface CredentialProblem {
  status: 401 | 429;
  code: "unauthorized" | "rate_limited";
  message: string;
  retryAfter?: number;
}

export const API_KEY_PERMISSION = "holler";

export const MCP_MEMBER_CLAIM = "holler_member";

export function permissionsFor(scope: Scope): Record<string, string[]> {
  return { [API_KEY_PERMISSION]: scope === "write" ? ["read", "write"] : ["read"] };
}

export function scopeOfPermissions(
  permissions: Record<string, string[]> | null | undefined,
): Scope {
  return permissions?.[API_KEY_PERMISSION]?.includes("write") ? "write" : "read";
}

type MemberRow = typeof schema.members.$inferSelect;

function principalOf(member: MemberRow, actor: Actor, scope: Scope): Principal {
  return {
    userId: member.userId,
    memberId: member.id,
    workspaceId: member.workspaceId,
    slackUserId: member.slackUserId,
    role: member.role,
    actor,
    scope,
  };
}

export async function principalFor(
  auth: Auth,
  db: Db,
  request: Request,
): Promise<Principal | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const member = await currentMemberFor(db, session.user.id);
  if (!member) return null;
  return principalOf(
    member,
    { via: "web", memberId: member.id, slackUserId: member.slackUserId },
    "write",
  );
}

export async function currentMemberFor(db: Db, userId: string): Promise<MemberRow | null> {
  const claims = await latestSlackClaims(db, userId);
  if (claims) {
    const [latest] = await db
      .select({ member: schema.members })
      .from(schema.members)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.members.workspaceId))
      .where(
        and(eq(schema.members.userId, userId), eq(schema.workspaces.slackTeamId, claims.teamId)),
      );
    if (latest) return latest.member;
  }
  const oldest = await db.query.members.findFirst({
    where: eq(schema.members.userId, userId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });
  return oldest ?? null;
}

export function apiKeyFrom(request: Request): string | null {
  const header = request.headers.get("x-api-key");
  if (header) return header.trim();
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(hlr_\S+)$/i);
  return match?.[1] ?? null;
}

export async function principalForApiKey(
  auth: Auth,
  db: Db,
  key: string,
): Promise<Principal | CredentialProblem> {
  const result = await auth.api.verifyApiKey({ body: { key } });
  if (!result.valid || !result.key) {
    const code = result.error?.code;
    if (code === "RATE_LIMITED" || code === "USAGE_EXCEEDED") {
      return {
        status: 429,
        code: "rate_limited",
        message: "This API key made too many requests. Wait a minute and try again.",
        retryAfter: retryAfterSeconds(result.error),
      };
    }
    return invalid("This API key is not valid. Make a new one in Settings.");
  }
  const memberId = memberIdOf(result.key.metadata);
  if (!memberId) return invalid("This API key is not valid. Make a new one in Settings.");
  const member = await db.query.members.findFirst({ where: eq(schema.members.id, memberId) });
  if (!member || member.userId !== result.key.referenceId) {
    return invalid("This API key belongs to someone who is no longer in the workspace.");
  }
  return principalOf(
    member,
    {
      via: "api",
      memberId: member.id,
      slackUserId: member.slackUserId,
      credentialId: result.key.id,
    },
    scopeOfPermissions(result.key.permissions),
  );
}

export async function principalForMcp(
  db: Db,
  claims: Record<string, unknown>,
): Promise<Principal | CredentialProblem> {
  const userId = typeof claims.sub === "string" ? claims.sub : null;
  const clientId = typeof claims.client_id === "string" ? claims.client_id : null;
  const memberId = typeof claims[MCP_MEMBER_CLAIM] === "string" ? claims[MCP_MEMBER_CLAIM] : null;
  if (!userId || !clientId || !memberId) {
    return invalid("This connection is from before workspaces were tied to it. Connect again.");
  }
  const consents = await db
    .select({ scopes: schema.oauthConsent.scopes })
    .from(schema.oauthConsent)
    .where(
      and(
        eq(schema.oauthConsent.clientId, clientId),
        eq(schema.oauthConsent.userId, userId),
        eq(schema.oauthConsent.referenceId, memberId),
      ),
    );
  if (consents.length === 0) {
    return invalid("This app was disconnected from Holler. Connect it again to continue.");
  }
  const member = await db.query.members.findFirst({ where: eq(schema.members.id, memberId) });
  if (!member || member.userId !== userId) {
    return invalid("You are no longer in the workspace this app was connected to.");
  }
  const granted = consents.some((row) => scopesOf(row.scopes).includes("write"));
  const tokenWrites = scopesOf(claims.scope).includes("write");
  return principalOf(
    member,
    { via: "mcp", memberId: member.id, slackUserId: member.slackUserId, credentialId: clientId },
    granted && tokenWrites ? "write" : "read",
  );
}

function invalid(message: string): CredentialProblem {
  return { status: 401, code: "unauthorized", message };
}

function memberIdOf(metadata: unknown): string | null {
  const value = typeof metadata === "string" ? safeJson(metadata) : metadata;
  if (value && typeof value === "object" && "memberId" in value) {
    const { memberId } = value as { memberId: unknown };
    return typeof memberId === "string" ? memberId : null;
  }
  return null;
}

export function scopesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((s): s is string => typeof s === "string");
  if (typeof value !== "string") return [];
  if (value.startsWith("[")) return scopesOf(safeJson(value));
  return value.split(" ").filter(Boolean);
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function retryAfterSeconds(error: unknown): number {
  const details = (error as { details?: { tryAgainIn?: unknown } } | null)?.details;
  const ms = typeof details?.tryAgainIn === "number" ? details.tryAgainIn : 60_000;
  return Math.max(1, Math.ceil(ms / 1000));
}
