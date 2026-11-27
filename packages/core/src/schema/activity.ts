import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { activityActions, activitySubjectTypes } from "../activity";
import { workspaces } from "./workspaces";

const now = sql`(unixepoch() * 1000)`;

/**
 * Every write in a workspace and who made it. services/audit.ts is the only writer; the
 * Activity screen reads it. `data` never holds a response's answers or anything secret.
 */
export const activity = sqliteTable(
  "activity",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Which door the write came through. */
    via: text("via", { enum: ["web", "slack", "api", "mcp", "system"] }).notNull(),
    /** The member who acted, or null for the system and for recipients answering. */
    memberId: text("member_id"),
    /** The API key or OAuth client, when `via` is api or mcp. */
    credentialId: text("credential_id"),
    action: text("action", { enum: activityActions }).notNull(),
    subjectType: text("subject_type", { enum: activitySubjectTypes }).notNull(),
    subjectId: text("subject_id").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
    at: integer("at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    index("activity_workspace_at").on(t.workspaceId, t.at),
    index("activity_subject").on(t.subjectType, t.subjectId),
  ],
);

/** Slack retries an event it thinks we missed. One row per event or view id we handled. */
export const slackDeliveries = sqliteTable("slack_deliveries", {
  id: text("id").primaryKey(),
  seenAt: integer("seen_at", { mode: "timestamp_ms" }).notNull().default(now),
});
