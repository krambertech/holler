import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { hollers } from "./hollers";
import { responses } from "./responses";

export const responseOwners = sqliteTable(
  "response_owners",
  {
    responseId: text("response_id")
      .primaryKey()
      .references(() => responses.id, { onDelete: "cascade" }),
    hollerId: text("holler_id")
      .notNull()
      .references(() => hollers.id, { onDelete: "cascade" }),
    slackUserId: text("slack_user_id").notNull(),
  },
  (t) => [
    uniqueIndex("response_owners_one_per_person").on(t.hollerId, t.slackUserId),
    index("response_owners_person").on(t.slackUserId),
  ],
);

export type ResponseOwnerRow = typeof responseOwners.$inferSelect;
