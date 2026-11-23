import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { questions } from "./hollers";
import { responses } from "./responses";

export const answerNotes = sqliteTable(
  "answer_notes",
  {
    responseId: text("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["note", "other"] }).notNull(),
    text: text("text").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.responseId, t.questionId, t.kind] }),
    index("answer_notes_question").on(t.questionId),
  ],
);

export type AnswerNoteRow = typeof answerNotes.$inferSelect;
