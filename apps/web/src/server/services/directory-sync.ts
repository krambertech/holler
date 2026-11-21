import { foldForSearch } from "@holler/core";
import { and, asc, eq, isNotNull, isNull, lt, or, sql } from "@holler/core/db";
import { runBatch } from "../batch";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import {
  SlackApiError,
  type SlackChannel,
  type SlackClient,
  type SlackUser,
  type SlackUserGroup,
} from "../slack/client";
import { slackFor } from "./slack-connection";

/**
 * Holler's copy of a workspace's Slack directory: people from users.list, user groups, public
 * channels and the private channels the bot was added to. The audience picker searches it, and
 * names, avatars and time zones come from it.
 *
 * A sync runs in steps. Each step reads a few pages and saves Slack's cursor, so a workspace of
 * thousands finishes over several cron runs. The budget keeps one step well under D1's limit of
 * statements per Worker invocation, since every person is one upsert.
 */
export const PAGES_PER_STEP = 2;
const DAY = 24 * 60 * 60 * 1000;

type Phase = "users" | "groups" | "channels";

function personRow(workspaceId: string, user: SlackUser, now: Date) {
  const name = user.profile?.real_name?.trim() || user.name;
  const displayName = user.profile?.display_name?.trim() || null;
  return {
    workspaceId,
    slackUserId: user.id,
    name,
    displayName,
    email: user.profile?.email ?? null,
    avatarUrl: user.profile?.image_72 ?? null,
    timeZone: user.tz ?? null,
    // Slackbot comes back from users.list without is_bot.
    isBot: Boolean(user.is_bot) || user.id === "USLACKBOT",
    isDeleted: Boolean(user.deleted),
    searchName: foldForSearch(name, displayName),
    refreshedAt: now,
  };
}

function upsertPerson(db: Db, workspaceId: string, user: SlackUser, now: Date) {
  const { workspaceId: _, slackUserId: __, ...rest } = personRow(workspaceId, user, now);
  return db
    .insert(schema.slackPeople)
    .values(personRow(workspaceId, user, now))
    .onConflictDoUpdate({
      target: [schema.slackPeople.workspaceId, schema.slackPeople.slackUserId],
      set: rest,
    });
}

function upsertGroup(
  db: Db,
  workspaceId: string,
  group: {
    slackId: string;
    kind: "usergroup" | "channel";
    name: string;
    handle: string | null;
    memberCount: number | null;
  },
  now: Date,
) {
  const values = {
    workspaceId,
    ...group,
    searchName: foldForSearch(group.name, group.handle),
    refreshedAt: now,
  };
  const { workspaceId: _, slackId: __, ...rest } = values;
  return db
    .insert(schema.slackGroups)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.slackGroups.workspaceId, schema.slackGroups.slackId],
      set: rest,
    });
}

const groupFromUserGroup = (group: SlackUserGroup) => ({
  slackId: group.id,
  kind: "usergroup" as const,
  name: group.name,
  handle: group.handle || null,
  memberCount: group.user_count ?? null,
});

const groupFromChannel = (channel: SlackChannel) => ({
  slackId: channel.id,
  kind: "channel" as const,
  name: channel.name,
  handle: null,
  memberCount: channel.num_members ?? null,
});

/** One person changed or joined: Slack's `user_change` and `team_join` events. */
export async function refreshSlackPerson(
  db: Db,
  workspaceId: string,
  user: SlackUser,
  now: Date,
): Promise<void> {
  await upsertPerson(db, workspaceId, user, now);
}

function parseCursor(stored: string | null): { phase: Phase; cursor: string } {
  const [phase, ...rest] = (stored ?? "users:").split(":");
  const known: Phase[] = ["users", "groups", "channels"];
  return {
    phase: known.includes(phase as Phase) ? (phase as Phase) : "users",
    cursor: rest.join(":"),
  };
}

export type SyncStep = "done" | "more";

/**
 * Reads up to `pages` pages of the directory and saves where it stopped. Starts a sync when none
 * is in progress. Returns "done" when the whole directory is read. A rate limit ends the step
 * early with its progress saved, and the next cron run carries on.
 */
export async function syncDirectoryStep(
  db: Db,
  slack: SlackClient,
  workspaceId: string,
  now: Date,
  pages = PAGES_PER_STEP,
): Promise<SyncStep> {
  let state = await db.query.directorySyncs.findFirst({
    where: eq(schema.directorySyncs.workspaceId, workspaceId),
  });
  if (!state?.runStartedAt) {
    const fresh = { workspaceId, runStartedAt: now, cursor: "users:" };
    await db
      .insert(schema.directorySyncs)
      .values(fresh)
      .onConflictDoUpdate({
        target: schema.directorySyncs.workspaceId,
        set: { runStartedAt: now, cursor: "users:" },
      });
    state = { ...fresh, completedAt: state?.completedAt ?? null };
  }
  const runStartedAt = state.runStartedAt ?? now;
  let { phase, cursor } = parseCursor(state.cursor);

  const save = () =>
    db
      .update(schema.directorySyncs)
      .set({ cursor: `${phase}:${cursor}` })
      .where(eq(schema.directorySyncs.workspaceId, workspaceId));

  try {
    for (let page = 0; page < pages; page++) {
      if (phase === "users") {
        const result = await slack.listUsers(cursor || undefined);
        await runBatch(
          db,
          result.members.map((user) => upsertPerson(db, workspaceId, user, now)),
        );
        cursor = result.nextCursor;
        if (!cursor) phase = "groups";
      } else if (phase === "groups") {
        const groups = await slack.listUserGroups();
        await runBatch(
          db,
          groups.map((group) => upsertGroup(db, workspaceId, groupFromUserGroup(group), now)),
        );
        phase = "channels";
        cursor = "";
      } else {
        const result = await slack.listChannels(cursor || undefined);
        await runBatch(
          db,
          result.channels
            .filter((channel) => !channel.is_archived)
            .map((channel) => upsertGroup(db, workspaceId, groupFromChannel(channel), now)),
        );
        cursor = result.nextCursor;
        if (!cursor) {
          await finish(db, workspaceId, runStartedAt, now);
          return "done";
        }
      }
    }
  } catch (error) {
    if (error instanceof SlackApiError && error.slackError === "ratelimited") {
      await save();
      return "more";
    }
    throw error;
  }
  await save();
  return "more";
}

/** Groups and channels Slack no longer lists are gone. People stay; users.list marks them deleted. */
async function finish(db: Db, workspaceId: string, runStartedAt: Date, now: Date) {
  await runBatch(db, [
    db
      .delete(schema.slackGroups)
      .where(
        and(
          eq(schema.slackGroups.workspaceId, workspaceId),
          lt(schema.slackGroups.refreshedAt, runStartedAt),
        ),
      ),
    db
      .update(schema.directorySyncs)
      .set({ runStartedAt: null, cursor: null, completedAt: now })
      .where(eq(schema.directorySyncs.workspaceId, workspaceId)),
  ]);
}

/**
 * Installed workspaces whose directory needs work: a sync in progress, never synced, or last
 * synced more than a day ago. Syncs in progress come first.
 */
export async function workspacesDueForSync(db: Db, now: Date, limit = 2): Promise<string[]> {
  const rows = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .innerJoin(
      schema.slackInstallations,
      eq(schema.slackInstallations.workspaceId, schema.workspaces.id),
    )
    .leftJoin(schema.directorySyncs, eq(schema.directorySyncs.workspaceId, schema.workspaces.id))
    .where(
      and(
        isNull(schema.workspaces.uninstalledAt),
        or(
          isNull(schema.directorySyncs.workspaceId),
          isNotNull(schema.directorySyncs.runStartedAt),
          isNull(schema.directorySyncs.completedAt),
          lt(schema.directorySyncs.completedAt, new Date(now.getTime() - DAY)),
        ),
      ),
    )
    .orderBy(
      sql`${schema.directorySyncs.runStartedAt} is null`,
      asc(sql`coalesce(${schema.directorySyncs.completedAt}, 0)`),
    )
    .limit(limit);
  return rows.map((row) => row.id);
}

/** The cron's pass: one step for each workspace that is due. One failure never stops the rest. */
export async function runDirectorySyncs(env: Bindings, db: Db, now: Date): Promise<void> {
  for (const workspaceId of await workspacesDueForSync(db, now)) {
    try {
      await syncDirectoryStep(db, await slackFor(env, db, workspaceId), workspaceId, now);
    } catch (error) {
      console.error(`Directory sync failed for ${workspaceId}`, error);
    }
  }
}
