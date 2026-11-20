import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

const now = sql`(unixepoch() * 1000)`;

/** One Slack workspace that installed Holler. Everything else hangs off it. */
export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    slackTeamId: text("slack_team_id").notNull(),
    slackEnterpriseId: text("slack_enterprise_id"),
    name: text("name").notNull(),
    /** The workspace's Slack subdomain, for links back into Slack. */
    slackDomain: text("slack_domain"),
    iconUrl: text("icon_url"),
    plan: text("plan", { enum: ["free", "team"] })
      .notNull()
      .default("free"),
    /** Set and cleared only by the Polar webhook. */
    polarCustomerId: text("polar_customer_id"),
    polarSubscriptionId: text("polar_subscription_id"),
    /** When a paid plan ends after a cancellation; null while it renews. */
    planEndsAt: integer("plan_ends_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    /** Set when Slack reports app_uninstalled or tokens_revoked. Sending stops until a reinstall. */
    uninstalledAt: integer("uninstalled_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("workspaces_slack_team").on(t.slackTeamId)],
);

/** The bot that "Add to Slack" installed. One per workspace; a reinstall replaces it. */
export const slackInstallations = sqliteTable("slack_installations", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  appId: text("app_id").notNull(),
  botUserId: text("bot_user_id").notNull(),
  /** AES-GCM under SLACK_TOKEN_KEY, as base64 iv.ciphertext. Never logged, never returned. */
  botTokenCiphertext: text("bot_token_ciphertext").notNull(),
  scopes: text("scopes").notNull(),
  installedBySlackUserId: text("installed_by_slack_user_id").notNull(),
  installedAt: integer("installed_at", { mode: "timestamp_ms" }).notNull().default(now),
});

/** A person who signed in to Holler with Slack, in one workspace. */
export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slackUserId: text("slack_user_id").notNull(),
    role: text("role", { enum: ["owner", "sender"] })
      .notNull()
      .default("sender"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("members_workspace_slack_user").on(t.workspaceId, t.slackUserId),
    index("members_user").on(t.userId),
  ],
);

/**
 * Holler's copy of the workspace's Slack directory: people, for the audience picker, names,
 * avatars and time zones. Refreshed from users.list; a person is never deleted, only marked.
 */
export const slackPeople = sqliteTable(
  "slack_people",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slackUserId: text("slack_user_id").notNull(),
    name: text("name").notNull(),
    displayName: text("display_name"),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    /** IANA zone such as Europe/Tallinn, for sends in each person's time zone. */
    timeZone: text("time_zone"),
    isBot: integer("is_bot", { mode: "boolean" }).notNull().default(false),
    isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
    /** Folded in JavaScript with toLocaleLowerCase, because SQLite's lower() is ASCII only. */
    searchName: text("search_name").notNull(),
    refreshedAt: integer("refreshed_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.slackUserId] }),
    index("slack_people_search").on(t.workspaceId, t.searchName),
  ],
);

/** Slack user groups and channels, for the audience picker. Members resolve at send time. */
export const slackGroups = sqliteTable(
  "slack_groups",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** A user group id (S…) or a channel id (C…). */
    slackId: text("slack_id").notNull(),
    kind: text("kind", { enum: ["usergroup", "channel"] }).notNull(),
    name: text("name").notNull(),
    handle: text("handle"),
    memberCount: integer("member_count"),
    searchName: text("search_name").notNull(),
    refreshedAt: integer("refreshed_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.slackId] })],
);
