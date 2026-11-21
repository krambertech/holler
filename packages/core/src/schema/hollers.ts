import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { repeatEvery } from "../repeats";
import { members, workspaces } from "./workspaces";

const now = sql`(unixepoch() * 1000)`;

/**
 * One ask sent to a set of people. A draft is a Holler with status `draft`, so drafts and
 * sent hollers share one editor, one API and one table.
 */
export const hollers = sqliteTable(
  "hollers",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => members.id),
    mode: text("mode", { enum: ["pulse", "survey", "chase"] }).notNull(),
    status: text("status", { enum: ["draft", "scheduled", "live", "closed"] })
      .notNull()
      .default("draft"),
    title: text("title").notNull().default(""),
    /** The title folded with toLocaleLowerCase in JavaScript, for search. SQLite's lower() is ASCII-only. */
    searchTitle: text("search_title").notNull().default(""),
    /** Markdown. Rendered as mrkdwn in Slack and as HTML on the web. */
    description: text("description").notNull().default(""),
    /** The form a chase points at. Null for pulse and survey. */
    externalUrl: text("external_url"),
    anonymous: integer("anonymous", { mode: "boolean" }).notNull().default(false),
    visibility: text("visibility", { enum: ["private", "workspace"] })
      .notNull()
      .default("private"),
    /** Lowercased, at most 10, each at most 40 characters. JSON array. */
    tags: text("tags", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    /** The audience as the sender chose it, kept so a draft reopens as it was. JSON. */
    audience: text("audience", { mode: "json" })
      .$type<AudienceSelection>()
      .notNull()
      .default(sql`'{"people":[],"groups":[],"everyone":false}'`),
    /** A channel to announce the Holler in, with a live count. */
    announceChannelId: text("announce_channel_id"),
    announceTs: text("announce_ts"),
    /** When to send. Null for a draft or a Holler sent at once. */
    sendAt: integer("send_at", { mode: "timestamp_ms" }),
    /** Send at sendAt's wall-clock time in each recipient's own time zone. */
    sendInRecipientTimeZone: integer("send_in_recipient_time_zone", { mode: "boolean" })
      .notNull()
      .default(false),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    /** Hours after the last send that the Holler closes, while it is a draft. */
    closeAfterHours: integer("close_after_hours").notNull().default(72),
    closesAt: integer("closes_at", { mode: "timestamp_ms" }),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    /** When the close work (DM edits, the notice, the announcement) was queued. Claimed once. */
    closeQueuedAt: integer("close_queued_at", { mode: "timestamp_ms" }),
    /** Reminders on or off. Their rhythm is fixed in packages/core/src/reminders.ts. */
    remindersEnabled: integer("reminders_enabled", { mode: "boolean" }).notNull().default(true),
    /** When the creator last sent a reminder to everyone waiting. Claimed to keep four hours between them. */
    remindedAt: integer("reminded_at", { mode: "timestamp_ms" }),
    /** The unguessable part of the report link. Null until the creator makes one. */
    reportToken: text("report_token"),
    createdVia: text("created_via", { enum: ["web", "slack", "api", "mcp"] }).notNull(),
    /** The API caller's Idempotency-Key, so a retried create returns the same Holler. */
    idempotencyKey: text("idempotency_key"),
    repeatOfId: text("repeat_of_id"),
    repeatRule: text("repeat_rule", { enum: repeatEvery }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    index("hollers_workspace_status").on(t.workspaceId, t.status),
    index("hollers_creator").on(t.creatorId),
    uniqueIndex("hollers_round").on(t.repeatOfId, t.sendAt),
    index("hollers_send_at").on(t.status, t.sendAt),
    index("hollers_closes_at").on(t.status, t.closesAt),
    uniqueIndex("hollers_report_token").on(t.reportToken),
    uniqueIndex("hollers_idempotency").on(t.workspaceId, t.idempotencyKey),
  ],
);

export interface AudienceSelection {
  people: string[];
  /** User group and channel ids. */
  groups: string[];
  everyone: boolean;
}

export const questions = sqliteTable(
  "questions",
  {
    id: text("id").primaryKey(),
    hollerId: text("holler_id")
      .notNull()
      .references(() => hollers.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: text("type", { enum: ["single", "multi", "text", "number", "person"] }).notNull(),
    style: text("style", { enum: ["plain", "scale", "binary"] })
      .notNull()
      .default("plain"),
    prompt: text("prompt").notNull(),
    /** One line of help under the prompt. */
    description: text("description").notNull().default(""),
    required: integer("required", { mode: "boolean" }).notNull().default(true),
    /** Multiple choice and person: the most someone may pick. Null is no limit. */
    maxChoices: integer("max_choices"),
    /** A choice question's follow-up note. Null asks for none. */
    followUpPrompt: text("follow_up_prompt"),
    /**
     * Positions of the options that show the follow-up, as a JSON array; null shows it after any
     * answer. Positions, not ids, because a question is written before its new options have ids.
     */
    followUpWhen: text("follow_up_when", { mode: "json" }).$type<number[]>(),
    /** Words at the low and high end of a numbered scale. */
    lowLabel: text("low_label"),
    highLabel: text("high_label"),
    /** A number question's smallest and largest whole number. */
    numberMin: integer("number_min"),
    numberMax: integer("number_max"),
  },
  (t) => [index("questions_holler").on(t.hollerId, t.position)],
);

export const options = sqliteTable(
  "options",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    /** The number a scale option counts as, for averages. Null on plain options. */
    score: integer("score"),
    /** The "Other" option, which takes a written answer. Always last. */
    isOther: integer("is_other", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    index("options_question").on(t.questionId, t.position),
    // Lets an answer's (question, option) pair be a foreign key, so an option can only answer its own question.
    uniqueIndex("options_question_id").on(t.questionId, t.id),
  ],
);

/**
 * Who a Holler went to and where each person is. The completion ledger: answered, reminders,
 * the DM to update. Kept separate from responses so an anonymous response links to nobody.
 */
export const recipients = sqliteTable(
  "recipients",
  {
    hollerId: text("holler_id")
      .notNull()
      .references(() => hollers.id, { onDelete: "cascade" }),
    slackUserId: text("slack_user_id").notNull(),
    /** How they joined: `person`, `group:<id>`, `everyone`, or `added` after the send. */
    addedVia: text("added_via").notNull(),
    /** When this person's DM is due. Differs per person for sends in their own time zone. */
    sendAt: integer("send_at", { mode: "timestamp_ms" }),
    /** Claimed by the queue consumer before it posts, so a retry never sends twice. */
    invitedAt: integer("invited_at", { mode: "timestamp_ms" }),
    dmChannelId: text("dm_channel_id"),
    /** The latest message to this person, which an answer replaces with a thank-you. */
    dmTs: text("dm_ts"),
    /** When they answered. For an anonymous Holler, rounded down to the hour. */
    answeredAt: integer("answered_at", { mode: "timestamp_ms" }),
    remindersSent: integer("reminders_sent").notNull().default(0),
    lastRemindedAt: integer("last_reminded_at", { mode: "timestamp_ms" }),
    snoozedUntil: integer("snoozed_until", { mode: "timestamp_ms" }),
    /** When the next rhythm reminder is due, from nextReminder. Null when none is due. */
    nextReminderAt: integer("next_reminder_at", { mode: "timestamp_ms" }),
    /** Why a send failed for good, such as `user_not_found`. Null while things are fine. */
    failure: text("failure"),
  },
  (t) => [
    primaryKey({ columns: [t.hollerId, t.slackUserId] }),
    index("recipients_due").on(t.invitedAt, t.sendAt),
    index("recipients_waiting").on(t.hollerId, t.answeredAt),
    index("recipients_next_reminder").on(t.nextReminderAt),
  ],
);

/** Members a Holler's creator shared its results with. */
export const viewers = sqliteTable(
  "viewers",
  {
    hollerId: text("holler_id")
      .notNull()
      .references(() => hollers.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    addedById: text("added_by_id")
      .notNull()
      .references(() => members.id),
    addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull().default(now),
    notifiedAt: integer("notified_at", { mode: "timestamp_ms" }),
  },
  (t) => [primaryKey({ columns: [t.hollerId, t.memberId] })],
);

export type QuestionRow = typeof questions.$inferSelect;
export type OptionRow = typeof options.$inferSelect;
export type HollerRow = typeof hollers.$inferSelect;
export type RecipientRow = typeof recipients.$inferSelect;
