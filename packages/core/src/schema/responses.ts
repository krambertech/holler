import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { hollers, options, questions } from "./hollers";

const now = sql`(unixepoch() * 1000)`;

/**
 * One recipient's answers to one Holler. For an anonymous Holler `slackUserId` is null and
 * `submittedAt` is rounded down to the hour, so nothing here points back at a person.
 * Who answered lives on `recipients.answeredAt` instead.
 */
export const responses = sqliteTable(
  "responses",
  {
    id: text("id").primaryKey(),
    hollerId: text("holler_id")
      .notNull()
      .references(() => hollers.id, { onDelete: "cascade" }),
    slackUserId: text("slack_user_id"),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull().default(now),
    via: text("via", { enum: ["slack_button", "slack_modal", "web", "api"] }).notNull(),
  },
  (t) => [
    index("responses_holler").on(t.hollerId),
    // One response per person on a named Holler. Anonymous ones are guarded by recipients.answeredAt.
    uniqueIndex("responses_one_per_person")
      .on(t.hollerId, t.slackUserId)
      .where(sql`${t.slackUserId} is not null`),
  ],
);

export const answers = sqliteTable(
  "answers",
  {
    id: text("id").primaryKey(),
    responseId: text("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    optionId: text("option_id"),
    text: text("text"),
  },
  (t) => [
    index("answers_response").on(t.responseId),
    index("answers_question").on(t.questionId),
    foreignKey({
      columns: [t.questionId, t.optionId],
      foreignColumns: [options.questionId, options.id],
    }),
    check("answers_one_value", sql`(${t.optionId} is null) <> (${t.text} is null)`),
  ],
);

export type ResponseRow = typeof responses.$inferSelect;
export type AnswerRow = typeof answers.$inferSelect;
