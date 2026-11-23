import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { workspaces } from "./workspaces";

export const directorySyncs = sqliteTable("directory_syncs", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  runStartedAt: integer("run_started_at", { mode: "timestamp_ms" }),
  cursor: text("cursor"),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});
