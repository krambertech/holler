import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { workspaces } from "./workspaces";

const now = sql`(unixepoch() * 1000)`;

/**
 * Every verified Polar subscription event services/billing.ts handled. The id makes a replayed
 * delivery a no-op, and `occurred_at` lets a late, older event lose to a newer one already applied.
 */
export const polarEvents = sqliteTable(
  "polar_events",
  {
    /** `subscription.updated:<subscription id>:<modified_at>`. */
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").notNull(),
    type: text("type").notNull(),
    /** The subscription's `modified_at`, or `created_at` when it was never modified. */
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    /** Whether the event changed the workspace, or arrived after a newer one and was skipped. */
    outcome: text("outcome", { enum: ["applied", "unchanged", "stale"] }).notNull(),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("polar_events_subscription").on(t.subscriptionId, t.occurredAt)],
);
