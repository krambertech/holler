import { and, desc, eq } from "@holler/core/db";
import { APIError } from "better-auth/api";
import type { Auth } from "../auth";
import { schema } from "../db";
import { permissionsFor, type Scope, scopeOfPermissions } from "../principal";
import { audit, auditStatement } from "./audit";
import { memberOf, type ServiceContext, ServiceError } from "./context";

/**
 * API keys for scripts. Better Auth stores them hashed; each one is pinned to the member who
 * made it through `metadata.memberId`, so a key never acts in another workspace. Only the
 * member themself, from the web app, lists, makes or revokes their keys.
 */

export interface ApiKeySummary {
  id: string;
  name: string;
  /** The first characters, so a person can tell keys apart. Never the key. */
  start: string | null;
  scope: Scope;
  lastUsedAt: string | null;
  createdAt: string;
}

async function userOf(ctx: ServiceContext): Promise<string> {
  const memberId = memberOf(ctx);
  const member = await ctx.db.query.members.findFirst({
    where: and(eq(schema.members.id, memberId), eq(schema.members.workspaceId, ctx.workspaceId)),
  });
  if (!member)
    throw new ServiceError("not_found", "Your membership no longer exists. Sign in again.");
  return member.userId;
}

function metadataMember(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const value: unknown = JSON.parse(metadata);
    // Better Auth may store the metadata JSON-encoded twice.
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return typeof parsed?.memberId === "string" ? parsed.memberId : null;
  } catch {
    return null;
  }
}

function permissionsOf(value: string | null): Record<string, string[]> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, string[]>;
  } catch {
    return null;
  }
}

/** The member's keys in this workspace, newest first. */
export async function listApiKeys(ctx: ServiceContext): Promise<ApiKeySummary[]> {
  const memberId = memberOf(ctx);
  const userId = await userOf(ctx);
  const rows = await ctx.db
    .select()
    .from(schema.apikey)
    .where(eq(schema.apikey.referenceId, userId))
    .orderBy(desc(schema.apikey.createdAt));
  return rows
    .filter((row) => metadataMember(row.metadata) === memberId)
    .map((row) => ({
      id: row.id,
      name: row.name ?? "Unnamed key",
      start: row.start,
      scope: scopeOfPermissions(permissionsOf(row.permissions)),
      lastUsedAt: row.lastRequest?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
}

/** Makes a key. The plain key is in the result and nowhere else; the database holds a hash. */
export async function createApiKey(
  ctx: ServiceContext,
  auth: Auth,
  input: { name: string; scope: Scope },
): Promise<ApiKeySummary & { key: string }> {
  const memberId = memberOf(ctx);
  const userId = await userOf(ctx);
  const created = await auth.api
    .createApiKey({
      body: {
        name: input.name,
        userId,
        permissions: permissionsFor(input.scope),
        metadata: { memberId },
      },
    })
    .catch((error: unknown) => {
      // Better Auth checks the name too; its message is written for developers.
      if (error instanceof APIError && error.statusCode < 500) {
        throw new ServiceError("invalid", "Use a name of 1 to 60 characters.", "name");
      }
      throw error;
    });
  await audit(ctx, {
    action: "api_key.created",
    subjectType: "api_key",
    subjectId: created.id,
    data: { name: input.name, scope: input.scope },
  });
  return {
    id: created.id,
    name: created.name ?? input.name,
    start: created.start ?? null,
    scope: input.scope,
    lastUsedAt: null,
    createdAt: new Date(created.createdAt).toISOString(),
    key: created.key,
  };
}

/** Revokes one of the member's own keys. The next request with it is refused. */
export async function revokeApiKey(ctx: ServiceContext, id: string): Promise<void> {
  const keys = await listApiKeys(ctx);
  const key = keys.find((k) => k.id === id);
  if (!key) throw new ServiceError("not_found", "That API key does not exist or is not yours.");
  await ctx.db.batch([
    ctx.db.delete(schema.apikey).where(eq(schema.apikey.id, id)),
    auditStatement(ctx, {
      action: "api_key.revoked",
      subjectType: "api_key",
      subjectId: id,
      data: { name: key.name },
    }),
  ]);
}
