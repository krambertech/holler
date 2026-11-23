import { newId } from "@holler/core";
import { and, asc, desc, eq, sql } from "@holler/core/db";
import { type Db, schema } from "../db";
import { activityOf, recordChange } from "./audit";
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

/** The claims Holler reads from a Slack OpenID Connect ID token. */
export interface SlackClaims {
  slackUserId: string;
  teamId: string;
  teamName: string | null;
  enterpriseId: string | null;
}

/**
 * Reads the claims in a Slack ID token. Better Auth received the token from Slack's token endpoint
 * over TLS in the same request, so its signature needs no second check here. Returns null for
 * anything that is not a Slack ID token.
 */
export function slackClaims(idToken: string | null | undefined): SlackClaims | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (c) =>
      c.charCodeAt(0),
    );
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    const slackUserId = claims["https://slack.com/user_id"];
    const teamId = claims["https://slack.com/team_id"];
    if (typeof slackUserId !== "string" || typeof teamId !== "string") return null;
    const teamName = claims["https://slack.com/team_name"];
    const enterpriseId = claims["https://slack.com/enterprise_id"];
    return {
      slackUserId,
      teamId,
      teamName: typeof teamName === "string" ? teamName : null,
      enterpriseId: typeof enterpriseId === "string" && enterpriseId ? enterpriseId : null,
    };
  } catch {
    return null;
  }
}

/**
 * Makes sure a Slack person who signed in has a member row in their workspace, and returns it.
 * Sign-in is open: everyone in an installed workspace becomes a sender. The person who installed
 * Holler becomes an owner when the workspace has no owner yet. DECISIONS.md, Access.
 */
export async function ensureMember(
  db: Db,
  input: { workspaceId: string; userId: string; slackUserId: string },
  now: Date,
): Promise<{ id: string; role: "owner" | "sender"; created: boolean }> {
  const { workspaceId, userId, slackUserId } = input;
  const existing = await db.query.members.findFirst({
    where: and(
      eq(schema.members.workspaceId, workspaceId),
      eq(schema.members.slackUserId, slackUserId),
    ),
  });
  if (existing) {
    // The same Slack person signed in as a different Holler user, say after an email change.
    if (existing.userId !== userId) {
      await db.update(schema.members).set({ userId }).where(eq(schema.members.id, existing.id));
    }
    return { id: existing.id, role: existing.role, created: false };
  }

  const [installation, owner] = await Promise.all([
    db.query.slackInstallations.findFirst({
      where: eq(schema.slackInstallations.workspaceId, workspaceId),
    }),
    db.query.members.findFirst({
      where: and(eq(schema.members.workspaceId, workspaceId), eq(schema.members.role, "owner")),
    }),
  ]);
  const role = !owner && installation?.installedBySlackUserId === slackUserId ? "owner" : "sender";
  const id = newId("member");
  const ctx: ServiceContext = {
    db,
    workspaceId,
    actor: { via: "web", memberId: id, slackUserId },
    now: () => now,
  };
  const inserted = await recordChange(
    ctx,
    activityOf(ctx, {
      action: "member.joined",
      subjectType: "member",
      subjectId: id,
      data: { role },
    }),
    db
      .insert(schema.members)
      .values({ id, workspaceId, userId, slackUserId, role, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: schema.members.id }),
  );
  if (inserted.length === 0) {
    // A second sign-in in the same moment made the row first.
    const winner = await db.query.members.findFirst({
      where: and(
        eq(schema.members.workspaceId, workspaceId),
        eq(schema.members.slackUserId, slackUserId),
      ),
    });
    if (!winner) throw new Error("Member row vanished while signing in");
    return { id: winner.id, role: winner.role, created: false };
  }
  return { id, role, created: true };
}

/**
 * Better Auth calls this whenever it stores a Slack account, on the first sign-in and on every
 * one after. It links the person to the workspace named in the ID token. Someone whose workspace
 * has not installed Holler, or belongs to Enterprise Grid, gets no member row; the install page
 * explains what to do.
 */
export async function linkSlackAccount(
  db: Db,
  account: { userId: string; providerId: string; idToken?: string | null | undefined },
  now: Date,
): Promise<string | null> {
  if (account.providerId !== "slack") return null;
  const claims = slackClaims(account.idToken);
  if (!claims || claims.enterpriseId) return null;
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.slackTeamId, claims.teamId),
  });
  if (!workspace) return null;
  const member = await ensureMember(
    db,
    { workspaceId: workspace.id, userId: account.userId, slackUserId: claims.slackUserId },
    now,
  );
  return member.id;
}

/** The newest Slack ID token Holler holds for a user: which workspace they last signed in to. */
export async function latestSlackClaims(db: Db, userId: string): Promise<SlackClaims | null> {
  const account = await db.query.account.findFirst({
    where: and(eq(schema.account.userId, userId), eq(schema.account.providerId, "slack")),
    orderBy: desc(schema.account.updatedAt),
  });
  return slackClaims(account?.idToken);
}

/** Everyone who signed in to the workspace, owners first, then by name. */
export async function listMembers(ctx: ServiceContext) {
  const memberId = memberOf(ctx);
  const rows = await ctx.db
    .select({
      id: schema.members.id,
      role: schema.members.role,
      slackUserId: schema.members.slackUserId,
      joinedAt: schema.members.createdAt,
      name: schema.slackPeople.name,
      displayName: schema.slackPeople.displayName,
      avatarUrl: schema.slackPeople.avatarUrl,
      fallbackName: schema.user.name,
    })
    .from(schema.members)
    .innerJoin(schema.user, eq(schema.user.id, schema.members.userId))
    .leftJoin(
      schema.slackPeople,
      and(
        eq(schema.slackPeople.workspaceId, schema.members.workspaceId),
        eq(schema.slackPeople.slackUserId, schema.members.slackUserId),
      ),
    )
    .where(eq(schema.members.workspaceId, ctx.workspaceId))
    .orderBy(
      sql`case ${schema.members.role} when 'owner' then 0 else 1 end`,
      asc(sql`coalesce(${schema.slackPeople.searchName}, '')`),
      asc(schema.user.name),
    );
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    slackUserId: row.slackUserId,
    name: row.name || row.fallbackName,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    joinedAt: row.joinedAt.toISOString(),
    isYou: row.id === memberId,
  }));
}

async function requireOwner(ctx: ServiceContext): Promise<string> {
  const memberId = memberOf(ctx);
  const me = await ctx.db.query.members.findFirst({
    where: and(eq(schema.members.id, memberId), eq(schema.members.workspaceId, ctx.workspaceId)),
  });
  if (me?.role !== "owner") {
    throw new ServiceError("forbidden", "Only an owner can change roles. Ask an owner to do it.");
  }
  return memberId;
}

/**
 * Makes a member an owner or a sender. Only owners may, and the last owner cannot stop being one,
 * so a workspace always has someone who can manage billing.
 */
export async function setMemberRole(
  ctx: ServiceContext,
  targetId: string,
  role: "owner" | "sender",
) {
  await requireOwner(ctx);
  const target = await ctx.db.query.members.findFirst({
    where: and(eq(schema.members.id, targetId), eq(schema.members.workspaceId, ctx.workspaceId)),
  });
  if (!target) throw new ServiceError("not_found", "This person is not a member of the workspace.");
  if (target.role === role) return { id: target.id, role };
  const lastOwner = new ServiceError(
    "conflict",
    "A workspace needs at least one owner. Make someone else an owner first.",
    "role",
  );
  if (role === "sender") {
    const [owners] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.members)
      .where(
        and(eq(schema.members.workspaceId, ctx.workspaceId), eq(schema.members.role, "owner")),
      );
    if ((owners?.count ?? 0) <= 1) throw lastOwner;
  }

  // The count guard is also inside the update, so two owners demoting each other at once still
  // leave one owner standing. The loser of that race gets the error below.
  const changed = await recordChange(
    ctx,
    activityOf(ctx, {
      action: "member.role_changed",
      subjectType: "member",
      subjectId: targetId,
      data: { from: target.role, to: role },
    }),
    ctx.db
      .update(schema.members)
      .set({ role })
      .where(
        and(
          eq(schema.members.id, targetId),
          eq(schema.members.role, target.role),
          role === "sender"
            ? sql`(select count(*) from ${schema.members} where ${schema.members.workspaceId} = ${ctx.workspaceId} and ${schema.members.role} = 'owner') > 1`
            : undefined,
        ),
      )
      .returning({ id: schema.members.id }),
  );
  if (changed.length === 0) {
    const now = await ctx.db.query.members.findFirst({ where: eq(schema.members.id, targetId) });
    if (now?.role !== role) throw lastOwner;
  }
  return { id: targetId, role };
}
