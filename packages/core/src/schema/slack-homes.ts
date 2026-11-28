import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { workspaces } from "./workspaces";

export const slackHomes = sqliteTable(
  "slack_homes",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slackUserId: text("slack_user_id").notNull(),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
    queuedAt: integer("queued_at", { mode: "timestamp_ms" }),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.slackUserId] })],
);
