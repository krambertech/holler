import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { workspaces } from "./workspaces";

/**
 * Where each workspace's directory sync stands. A sync reads users.list a few pages at a time, so
 * a workspace of thousands finishes over several cron runs instead of timing out in one.
 */
export const directorySyncs = sqliteTable("directory_syncs", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  /** When the sync in progress began; null between syncs. Groups not seen since are removed. */
  runStartedAt: integer("run_started_at", { mode: "timestamp_ms" }),
  /** users.list's cursor for the next page of the sync in progress. */
  cursor: text("cursor"),
  /** When the last full sync finished. The cron starts another a day later. */
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});
