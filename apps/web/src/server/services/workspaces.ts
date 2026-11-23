import { newId } from "@holler/core";
import { and, eq, isNull, ne, sql } from "@holler/core/db";
import { type Db, schema } from "../db";
import type { SlackClient, SlackInstallGrant } from "../slack/client";
import { encryptToken } from "../slack/tokens";
import { activityOf, recordChange } from "./audit";
import { memberOf, type ServiceContext } from "./context";
import { ensureMember, latestSlackClaims } from "./members";

const systemContext = (db: Db, workspaceId: string, now: Date): ServiceContext => ({
  db,
  workspaceId,
  actor: { via: "system" },
  now: () => now,
});

export type InstallOutcome =
  | {
      status: "installed";
      workspaceId: string;
      reinstalled: boolean;
      installerMemberId: string | null;
    }
  | { status: "enterprise" };

/**
 * Finishes "Add to Slack": stores the bot token encrypted, creates or updates the workspace, and
 * clears an earlier uninstall. The installer becomes an owner when the workspace has no owner,
 * now if they have signed in to Holler before and otherwise on their first sign-in.
 * Enterprise Grid installs are refused and their token revoked. DECISIONS.md, Access.
 */
export async function completeInstall(
  db: Db,
  input: { grant: SlackInstallGrant; slack: SlackClient; tokenKey: string; now: Date },
): Promise<InstallOutcome> {
  const { grant, slack, tokenKey, now } = input;
  if (grant.enterpriseId || grant.isEnterpriseInstall) {
    await slack
      .revokeToken()
      .catch((error) => console.error("Could not revoke a Grid install", error));
    return { status: "enterprise" };
  }

  const team = await slack.teamInfo().catch((error) => {
    // team:read is new to the manifest; an app created before it still installs.
    console.error("team.info failed during install", error);
    return null;
  });
  const details = {
    name: team?.name ?? grant.teamName,
    slackDomain: team?.domain ?? null,
    iconUrl: team?.icon && !team.icon.image_default ? (team.icon.image_132 ?? null) : null,
  };
  const existing = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.slackTeamId, grant.teamId),
  });
  await db
    .insert(schema.workspaces)
    .values({ id: newId("workspace"), slackTeamId: grant.teamId, ...details, createdAt: now })
    .onConflictDoUpdate({
      target: schema.workspaces.slackTeamId,
      set: details,
    });
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.slackTeamId, grant.teamId),
  });
  if (!workspace) throw new Error("The workspace row is missing right after the install wrote it");

  const installation = {
    appId: grant.appId,
    botUserId: grant.botUserId,
    botTokenCiphertext: await encryptToken(grant.botToken, tokenKey),
    scopes: grant.scopes,
    installedBySlackUserId: grant.installerSlackUserId,
    installedAt: now,
  };
  const ctx = systemContext(db, workspace.id, now);
  await recordChange(
    ctx,
    activityOf(ctx, {
      action: existing ? "workspace.reinstalled" : "workspace.installed",
      subjectType: "workspace",
      subjectId: workspace.id,
      data: { slackUserId: grant.installerSlackUserId },
    }),
    db
      .insert(schema.slackInstallations)
      .values({ workspaceId: workspace.id, ...installation })
      .onConflictDoUpdate({ target: schema.slackInstallations.workspaceId, set: installation }),
    {
      after: [
        db
          .update(schema.workspaces)
          .set({ uninstalledAt: null })
          .where(eq(schema.workspaces.id, workspace.id)),
      ],
    },
  );

  const installerMemberId = await makeInstallerOwner(
    db,
    workspace.id,
    grant.installerSlackUserId,
    now,
  );
  return {
    status: "installed",
    workspaceId: workspace.id,
    reinstalled: Boolean(existing),
    installerMemberId,
  };
}

/**
 * When no owner is left, the installer becomes one. If they already signed in with Slack, their
 * member row is made or promoted now, so the install lands them straight in Holler.
 */
async function makeInstallerOwner(db: Db, workspaceId: string, slackUserId: string, now: Date) {
  const account = await db.query.account.findFirst({
    where: and(eq(schema.account.providerId, "slack"), eq(schema.account.accountId, slackUserId)),
  });
  const owner = await db.query.members.findFirst({
    where: and(eq(schema.members.workspaceId, workspaceId), eq(schema.members.role, "owner")),
  });
  const member = account
    ? await ensureMember(db, { workspaceId, userId: account.userId, slackUserId }, now)
    : null;
  if (member && member.role !== "owner" && !owner) {
    const ctx = systemContext(db, workspaceId, now);
    await recordChange(
      ctx,
      activityOf(ctx, {
        action: "member.role_changed",
        subjectType: "member",
        subjectId: member.id,
        data: { from: member.role, to: "owner", reason: "reinstalled" },
      }),
      db
        .update(schema.members)
        .set({ role: "owner" })
        .where(and(eq(schema.members.id, member.id), ne(schema.members.role, "owner"))),
    );
  }
  return member?.id ?? null;
}

/**
 * Slack's `app_uninstalled`, or `tokens_revoked` for the bot. Sending stops until someone adds
 * Holler again; drafts, results and members stay. Safe to call twice.
 */
export async function markUninstalled(db: Db, slackTeamId: string, now: Date): Promise<boolean> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.slackTeamId, slackTeamId),
  });
  if (!workspace || workspace.uninstalledAt) return false;
  const ctx = systemContext(db, workspace.id, now);
  await recordChange(
    ctx,
    activityOf(ctx, {
      action: "workspace.uninstalled",
      subjectType: "workspace",
      subjectId: workspace.id,
    }),
    db
      .update(schema.workspaces)
      .set({ uninstalledAt: now })
      .where(and(eq(schema.workspaces.id, workspace.id), isNull(schema.workspaces.uninstalledAt))),
    {
      after: [
        // The token is dead; without the row, slackFor says Holler is not installed.
        db
          .delete(schema.slackInstallations)
          .where(eq(schema.slackInstallations.workspaceId, workspace.id)),
      ],
    },
  );
  return true;
}

/** The workspace's id for a Slack team id, or null when Holler has never been installed there. */
export async function workspaceIdForTeam(db: Db, slackTeamId: string): Promise<string | null> {
  const workspace = await db.query.workspaces.findFirst({
    columns: { id: true },
    where: eq(schema.workspaces.slackTeamId, slackTeamId),
  });
  return workspace?.id ?? null;
}

/** The Workspace section of Settings. */
export async function workspaceSettings(ctx: ServiceContext) {
  memberOf(ctx);
  const [row] = await ctx.db
    .select({
      workspace: schema.workspaces,
      installedAt: schema.slackInstallations.installedAt,
      installedBy: schema.slackPeople.name,
      syncedAt: schema.directorySyncs.completedAt,
    })
    .from(schema.workspaces)
    .leftJoin(
      schema.slackInstallations,
      eq(schema.slackInstallations.workspaceId, schema.workspaces.id),
    )
    .leftJoin(
      schema.slackPeople,
      and(
        eq(schema.slackPeople.workspaceId, schema.workspaces.id),
        eq(schema.slackPeople.slackUserId, schema.slackInstallations.installedBySlackUserId),
      ),
    )
    .leftJoin(schema.directorySyncs, eq(schema.directorySyncs.workspaceId, schema.workspaces.id))
    .where(eq(schema.workspaces.id, ctx.workspaceId));
  if (!row) throw new Error("The signed-in member's workspace is missing");
  const [people] = await ctx.db
    .select({ count: sql<number>`count(*)` })
    .from(schema.slackPeople)
    .where(
      and(
        eq(schema.slackPeople.workspaceId, ctx.workspaceId),
        eq(schema.slackPeople.isBot, false),
        eq(schema.slackPeople.isDeleted, false),
      ),
    );
  return {
    name: row.workspace.name,
    iconUrl: row.workspace.iconUrl,
    slackDomain: row.workspace.slackDomain,
    installed: row.workspace.uninstalledAt == null,
    uninstalledAt: row.workspace.uninstalledAt?.toISOString() ?? null,
    installedAt: row.installedAt?.toISOString() ?? null,
    installedBy: row.installedBy ?? null,
    people: people?.count ?? 0,
    directorySyncedAt: row.syncedAt?.toISOString() ?? null,
  };
}

/**
 * What the install page needs to know about whoever opened it: signed in or not, a member or
 * not, and which Slack workspace they signed in to.
 */
export async function installStatus(db: Db, userId: string | null) {
  if (!userId) return { signedIn: false, member: false, teamName: null, enterprise: false };
  const member = await db.query.members.findFirst({
    columns: { id: true },
    where: eq(schema.members.userId, userId),
  });
  const claims = await latestSlackClaims(db, userId);
  return {
    signedIn: true,
    member: Boolean(member),
    teamName: claims?.teamName ?? null,
    enterprise: Boolean(claims?.enterpriseId),
  };
}
