import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { workspaces } from "./workspaces";

/**
 * Who has an App Home in Slack, and whether a fresh one is on its way. A Home is built from the
 * current state every time it is published, so this holds no copy of what it shows. Holler
 * publishes after a change only to people who opened their Home at least once; everyone else
 * gets a fresh one when they first open it. docs/slack.md, App Home.
 */
export const slackHomes = sqliteTable(
  "slack_homes",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slackUserId: text("slack_user_id").notNull(),
    /** The last app_home_opened. */
    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
    /** When a publish was put on the queue. Claimed once, so a burst of changes publishes once. */
    queuedAt: integer("queued_at", { mode: "timestamp_ms" }),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.slackUserId] })],
);
