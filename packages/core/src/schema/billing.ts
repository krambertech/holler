import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { workspaces } from "./workspaces";

const now = sql`(unixepoch() * 1000)`;

export const polarEvents = sqliteTable(
  "polar_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").notNull(),
    type: text("type").notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    outcome: text("outcome", { enum: ["applied", "unchanged", "stale"] }).notNull(),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("polar_events_subscription").on(t.subscriptionId, t.occurredAt)],
);
