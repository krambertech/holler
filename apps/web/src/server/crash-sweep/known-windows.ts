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
    operation: "sendHoller to more people than one batch holds",
    failure: "killed after insert recipients",
    breaks: ["invited", "audience"],
  },
  {
    operation: "sendHoller",
    failure:
      "killed after update hollers: status, sent_at, closes_at, updated_at + insert activity",
    breaks: ["audience"],
  },
  {
    operation: "sendHoller to more people than one batch holds",
    failure:
      "killed after update hollers: status, sent_at, closes_at, updated_at + insert activity",
    breaks: ["audience"],
  },
  {
    operation: "sendDueHollers",
    failure:
      "killed after update hollers: status, sent_at, closes_at, updated_at + insert activity",
    breaks: ["audience", "rounds"],
  },
  {
    operation: "queueDueInvites",
    failure: "killed after update recipients: invited_at",
    breaks: ["invited"],
  },
  {
    operation: "sendDueHollers",
    failure: "killed after insert recipients",
    breaks: ["invited", "rounds"],
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
    failure:
      "killed after insert hollers + insert questions + insert options + update hollers: status + insert activity + delete hollers",
    breaks: ["invited"],
  },
  {
    operation: "sendHoller to more people than one batch holds",
    failure: "killed after insert recipients #2",
    breaks: ["invited"],
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
    operation: "remindWaiting",
    failure:
      "killed after update recipients: reminders_sent, next_reminder_at + insert activity + update hollers: reminded_at",
    breaks: ["reminderNow", "reminded", "rhythm"],
  },
  {
    operation: "queueDueReminders",
    failure: "killed after update recipients: reminders_sent, reminder_queued_at, next_reminder_at",
    breaks: ["reminded", "rhythm"],
  },
  {
    operation: "deliver reminder",
    failure: "killed after insert slack deliveries",
    breaks: ["rhythm"],
  },
  {
    operation: "remindWaiting",
    failure:
      "queue reminder refused, killed after update recipients: reminders_sent, next_reminder_at",
    breaks: ["reminderNow"],
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
    operation: "closeDueHollers, then queueCloseWork",
    failure: "killed after update hollers: close_queued_at #2",
    breaks: ["closedDm", "notice"],
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
];
