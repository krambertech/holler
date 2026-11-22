import type { SlackSend } from "../services/delivery";
import type { PromiseId } from "./promises";
import type { Posting } from "./sweep";

export const postings: Partial<Record<SlackSend["kind"], Posting>> = {
  invite: "at most once",
  reminder: "at most once",
  announce: "at most once",
  close_notice: "at most once",
  send_failed: "at most once",
};

export interface KnownWindow {
  operation: string;
  failure: string;
  breaks: PromiseId[];
  tradeOff?: true;
}

export const knownWindows: KnownWindow[] = [
  {
    operation: "queueDueInvites",
    failure: "killed after update recipients: invited_at",
    breaks: ["invited"],
  },
  {
    operation: "sendDueHollers",
    failure: "killed after insert recipients",
    breaks: ["invited", "rounds", "activity"],
  },
  {
    operation: "sendDueHollers",
    failure:
      "killed after insert activity + insert hollers + insert questions + insert options + delete hollers + delete activity",
    breaks: ["invited"],
  },
  {
    operation: "sendHoller to more people than one batch holds",
    failure: "killed after insert recipients",
    breaks: ["invited", "audience", "activity"],
  },
  {
    operation: "sendHoller to more people than one batch holds",
    failure: "killed after insert activity",
    breaks: ["invited"],
  },
  {
    operation: "sendHoller to more people than one batch holds",
    failure: "killed after queue invite",
    breaks: ["invited"],
  },
  {
    operation: "sendHoller to more people than one batch holds",
    failure: "queue invite refused, killed after update recipients: invited_at",
    breaks: ["invited"],
  },
  {
    operation: "sendHoller",
    failure: "killed after insert recipients",
    breaks: ["invited", "activity"],
  },
  {
    operation: "sendHoller",
    failure: "killed after insert activity",
    breaks: ["invited"],
  },
  {
    operation: "deliver invite",
    failure: "killed after insert slack deliveries",
    breaks: ["invited"],
    tradeOff: true,
  },
  {
    operation: "sendDueHollers",
    failure: "killed after update hollers: status, sent_at, closes_at, updated_at",
    breaks: ["audience", "rounds", "activity"],
  },
  {
    operation: "sendDueHollers",
    failure: "insert recipients refused, killed after delete recipients",
    breaks: ["audience", "rounds", "activity"],
  },
  {
    operation: "sendDueHollers",
    failure:
      "insert activity + insert hollers + insert questions + insert options + delete hollers + delete activity refused, killed after delete recipients",
    breaks: ["audience", "rounds", "activity"],
  },
  {
    operation: "sendHoller to more people than one batch holds",
    failure: "killed after update hollers: status, sent_at, closes_at, updated_at",
    breaks: ["audience", "activity"],
  },
  {
    operation: "sendHoller to more people than one batch holds",
    failure: "insert recipients refused, killed after delete recipients",
    breaks: ["audience", "activity"],
  },
  {
    operation: "sendHoller to more people than one batch holds",
    failure: "insert activity refused, killed after delete recipients",
    breaks: ["audience", "activity"],
  },
  {
    operation: "sendHoller",
    failure: "killed after update hollers: status, sent_at, closes_at, updated_at",
    breaks: ["audience", "activity"],
  },
  {
    operation: "sendHoller",
    failure: "insert recipients refused, killed after delete recipients",
    breaks: ["audience", "activity"],
  },
  {
    operation: "sendHoller",
    failure: "insert activity refused, killed after delete recipients",
    breaks: ["audience", "activity"],
  },
  {
    operation: "answerOnWeb",
    failure: "killed after update recipients: answered_at",
    breaks: ["answer"],
  },
  {
    operation: "answerFromSlack, then queueOutcome",
    failure: "killed after update recipients: answered_at",
    breaks: ["answer"],
  },
  {
    operation: "queueDueReminders",
    failure: "killed after update recipients: reminders_sent, next_reminder_at",
    breaks: ["reminded", "rhythm"],
  },
  {
    operation: "remindWaiting",
    failure: "killed after update recipients: reminders_sent, next_reminder_at",
    breaks: ["reminded", "rhythm", "reminderNow", "activity"],
  },
  {
    operation: "deliver invite",
    failure: "killed after Slack posts invite",
    breaks: ["reminded", "rhythm"],
  },
  {
    operation: "deliver invite",
    failure: "update recipients: dm_channel_id, dm_ts, next_reminder_at refused",
    breaks: ["reminded", "rhythm", "closedDm"],
  },
  {
    operation: "deliver reminder",
    failure: "killed after Slack posts reminder",
    breaks: ["reminded", "rhythm"],
  },
  {
    operation: "deliver reminder",
    failure: "update recipients: dm_channel_id, dm_ts, last_reminded_at, next_reminder_at refused",
    breaks: ["reminded", "rhythm", "closedDm"],
  },
  {
    operation: "deliver reminder",
    failure: "killed after insert slack deliveries",
    breaks: ["reminded"],
    tradeOff: true,
  },
  {
    operation: "deliver reminder",
    failure: "killed after insert slack deliveries",
    breaks: ["rhythm"],
  },
  {
    operation: "remindWaiting",
    failure: "killed after update hollers: reminded_at",
    breaks: ["reminderNow", "activity"],
  },
  {
    operation: "remindWaiting",
    failure: "update recipients: reminders_sent, next_reminder_at refused",
    breaks: ["reminderNow", "activity"],
  },
  {
    operation: "remindWaiting",
    failure:
      "queue reminder refused, killed after update recipients: reminders_sent, next_reminder_at",
    breaks: ["reminderNow", "activity"],
  },
  {
    operation: "closeHoller",
    failure: "killed after update hollers: close_queued_at",
    breaks: ["notice", "counted", "closedDm"],
  },
  {
    operation: "closeDueHollers, then queueCloseWork",
    failure: "killed after update hollers: close_queued_at",
    breaks: ["notice", "closedDm"],
  },
  {
    operation: "deliver close_notice",
    failure: "killed after insert slack deliveries",
    breaks: ["notice"],
    tradeOff: true,
  },
  {
    operation: "sendDueHollers with nobody to send to",
    failure: "killed after update hollers: status, updated_at + insert activity",
    breaks: ["told"],
  },
  {
    operation: "sendDueHollers with nobody to send to",
    failure: "queue send_failed refused",
    breaks: ["told"],
  },
  {
    operation: "deliver send_failed",
    failure: "killed after insert slack deliveries",
    breaks: ["told"],
    tradeOff: true,
  },
  {
    operation: "deliver announce",
    failure: "killed after insert slack deliveries",
    breaks: ["announced"],
    tradeOff: true,
  },
  {
    operation: "answerFromSlack, then queueOutcome",
    failure: "killed after insert responses + insert response owners + insert answers",
    breaks: ["counted"],
  },
  {
    operation: "answerFromSlack, then queueOutcome",
    failure: "queue answered + announce refused",
    breaks: ["counted"],
  },
  {
    operation: "deliver announce",
    failure: "update hollers: announce_ts refused",
    breaks: ["counted"],
  },
  {
    operation: "deliver announce",
    failure: "killed after Slack posts announce",
    breaks: ["counted"],
    tradeOff: true,
  },
  {
    operation: "deliver invite",
    failure: "killed after Slack posts invite",
    breaks: ["closedDm"],
    tradeOff: true,
  },
  {
    operation: "deliver reminder",
    failure: "killed after Slack posts reminder",
    breaks: ["closedDm"],
    tradeOff: true,
  },
  {
    operation: "remindWaiting",
    failure: "killed after queue reminder",
    breaks: ["activity"],
  },
  {
    operation: "remindWaiting",
    failure: "insert activity refused",
    breaks: ["activity"],
  },
  {
    operation: "closeHoller",
    failure: "killed after update hollers: status, closed_at, updated_at",
    breaks: ["activity"],
  },
  {
    operation: "closeHoller",
    failure: "insert activity refused",
    breaks: ["activity"],
  },
  {
    operation: "closeDueHollers, then queueCloseWork",
    failure: "killed after update hollers: status, closed_at, updated_at",
    breaks: ["activity"],
  },
  {
    operation: "closeDueHollers, then queueCloseWork",
    failure: "insert activity refused",
    breaks: ["activity"],
  },
  {
    operation: "addNoteFromSlack",
    failure: "killed after insert answer notes",
    breaks: ["activity"],
  },
  {
    operation: "addNoteFromSlack",
    failure: "insert activity refused",
    breaks: ["activity"],
  },
];
