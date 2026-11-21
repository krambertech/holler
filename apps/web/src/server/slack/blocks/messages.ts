import type { ReminderTone } from "@holler/core";
import type { PostMessage } from "../client";
import {
  actionIds,
  answerKind,
  context,
  contextLine,
  escapeMrkdwn,
  mrkdwn,
  plain,
  type SlackHoller,
  section,
  sections,
  timeOfDay,
  when,
} from "./format";

/**
 * Every message Holler posts, as pure functions of the Holler and the reader's time zone. Each
 * sets `text` to the point, because notifications and screen readers read only that. No emoji.
 * docs/slack.md, Messages.
 */
type Message = Omit<PostMessage, "channel">;

interface Reader {
  /** The reader's IANA zone, for "Closes Friday at 18:00". */
  timeZone: string | null;
  now: Date;
}

const title = (holler: SlackHoller) => `*${escapeMrkdwn(holler.title)}*`;
const italic = (holler: SlackHoller) => `_${escapeMrkdwn(holler.title)}_`;

function heading(holler: SlackHoller, reader: Reader) {
  const blocks: unknown[] = [section(title(holler))];
  if (holler.description.trim()) blocks.push(...sections(mrkdwn(holler.description)));
  blocks.push(context(contextLine(holler, reader.timeZone, reader.now)));
  return blocks;
}

/** The answer controls under an invite: option buttons, Answer, or the form's two buttons. */
function controls(holler: SlackHoller, label: string): unknown[] {
  const kind = answerKind(holler);
  if (kind === "one_tap") {
    const question = holler.questions[0];
    if (!question) return [];
    // A pulse's one question is often its title; say it once.
    const repeats = question.prompt.trim() === holler.title.trim();
    return [
      ...(repeats ? [] : [section(`*${escapeMrkdwn(question.prompt)}*`)]),
      {
        type: "actions",
        block_id: `answer:${holler.id}`,
        elements: question.options.map((option, index) => ({
          type: "button",
          action_id: `${actionIds.option}_${index}`,
          text: plain(option.label),
          value: `${holler.id}|${question.id}|${option.id}`,
        })),
      },
    ];
  }
  if (kind === "chase") {
    return [
      {
        type: "actions",
        block_id: `answer:${holler.id}`,
        elements: [
          {
            type: "button",
            action_id: actionIds.formLink,
            text: plain("Open the form"),
            url: holler.externalUrl ?? undefined,
          },
          {
            type: "button",
            action_id: actionIds.done,
            text: plain("I submitted it"),
            style: "primary",
            value: holler.id,
          },
        ],
      },
    ];
  }
  return [
    {
      type: "actions",
      block_id: `answer:${holler.id}`,
      elements: [
        {
          type: "button",
          action_id: actionIds.open,
          text: plain(label),
          style: "primary",
          value: holler.id,
        },
      ],
    },
  ];
}

/** The first DM a recipient gets. */
export function inviteMessage(holler: SlackHoller, reader: Reader): Message {
  return {
    text: `${holler.senderName} sent you a Holler: ${holler.title}`,
    blocks: [
      section(`_${escapeMrkdwn(holler.senderName)}_ sent you a Holler.`),
      ...heading(holler, reader),
      ...controls(holler, "Answer"),
    ],
  };
}

function reminderText(holler: SlackHoller, tone: ReminderTone, reader: Reader) {
  const sender = escapeMrkdwn(holler.senderName);
  switch (tone) {
    case "gentle":
      return {
        text: `A reminder: ${holler.senderName} still needs your answer to ${holler.title}`,
        mrkdwn: `A reminder: ${sender} still needs your answer to ${italic(holler)}`,
      };
    case "nudge":
      return {
        text: `${holler.senderName} is still waiting on your answer to ${holler.title} It takes a minute.`,
        mrkdwn: `${sender} is still waiting on your answer to ${italic(holler)} It takes a minute.`,
      };
    case "last": {
      if (!holler.closesAt)
        throw new Error(`Holler ${holler.id} is reminding without a close time`);
      const closes = when(holler.closesAt, reader.timeZone, reader.now);
      return {
        text: `Last reminder: ${holler.title} closes ${closes}.`,
        mrkdwn: `Last reminder: ${italic(holler)} closes ${closes}.`,
      };
    }
  }
}

/**
 * A reminder, posted as a new DM so it notifies. A one-tap pulse keeps its buttons; anything else
 * gets Answer now. Remind me later is left off the last one, because nothing follows it.
 * `snoozedUntil` is set when the person already snoozed this one.
 */
export function reminderMessage(
  holler: SlackHoller,
  tone: ReminderTone,
  reader: Reader,
  snoozedUntil: Date | null = null,
): Message {
  const words = reminderText(holler, tone, reader);
  const blocks: unknown[] = [section(words.mrkdwn), ...controls(holler, "Answer now")];
  if (snoozedUntil) {
    blocks.push(context(`I'll remind you again at ${timeOfDay(snoozedUntil, reader.timeZone)}.`));
  } else if (tone !== "last") {
    blocks.push({
      type: "actions",
      block_id: `snooze:${holler.id}`,
      elements: [
        {
          type: "button",
          action_id: actionIds.snooze,
          text: plain("Remind me later"),
          value: holler.id,
        },
      ],
    });
  }
  return { text: words.text, blocks };
}

/** What a recipient answered, question by question, for the thank-you. */
export interface AnswerSummary {
  prompt: string;
  /** The picked labels, or the text they wrote. Empty when they skipped an optional question. */
  values: string[];
}

/** Replaces the invite or reminder once they answer, so the DM never shows a stale question. */
export function answeredMessage(holler: SlackHoller, answers: AnswerSummary[]): Message {
  if (holler.mode === "chase") {
    return {
      text: `Thanks. You marked ${holler.title} as submitted.`,
      blocks: [section(`Thanks. You marked ${italic(holler)} as submitted.`)],
    };
  }
  const blocks: unknown[] = [section(`Thanks. Your answer to ${italic(holler)} is in.`)];
  if (holler.anonymous) {
    blocks.push(context("Answered anonymously"));
  } else {
    for (const answer of answers) {
      if (answer.values.length === 0) continue;
      blocks.push(
        context(
          `*${escapeMrkdwn(answer.prompt)}*\n${answer.values.map((v) => escapeMrkdwn(v)).join(", ")}`,
        ),
      );
    }
  }
  return { text: `Thanks. Your answer to ${holler.title} is in.`, blocks };
}

/** Replaces an unanswered DM when the Holler closes, and answers a tap on a closed one. */
export function closedMessage(holler: SlackHoller, closedAt: Date, reader: Reader): Message {
  const at = when(closedAt, reader.timeZone, reader.now);
  return {
    text: `${holler.title} closed. It takes no more answers.`,
    blocks: [
      section(`${italic(holler)} closed on ${at}. It takes no more answers.`),
      context(`From ${escapeMrkdwn(holler.senderName)}`),
    ],
  };
}

export interface Counts {
  answered: number;
  recipients: number;
}

function answeredLine({ answered, recipients }: Counts) {
  return `${answered} of ${recipients} answered`;
}

/** The optional channel post, kept current after every answer. It never names who answered. */
export function announcementMessage(holler: SlackHoller, counts: Counts, closed: boolean): Message {
  const sender = escapeMrkdwn(holler.senderName);
  const text =
    counts.recipients === 1
      ? `${holler.senderName} sent a Holler to 1 person: ${holler.title}`
      : `${holler.senderName} sent a Holler to ${counts.recipients} people: ${holler.title}`;
  const lead =
    counts.recipients === 1
      ? `${sender} sent a Holler to 1 person: ${italic(holler)}`
      : `${sender} sent a Holler to ${counts.recipients} people: ${italic(holler)}`;
  return {
    text,
    blocks: [
      section(lead),
      context(closed ? `Closed. ${answeredLine(counts)}.` : answeredLine(counts)),
    ],
  };
}

/** To the creator when their Holler closes. */
export function closeNoticeMessage(holler: SlackHoller, counts: Counts, resultsUrl: string) {
  const line = `${answeredLine(counts)}.`;
  return {
    text: `${holler.title} closed. ${line}`,
    blocks: [
      section(`${italic(holler)} closed. ${line}`),
      {
        type: "actions",
        block_id: `results:${holler.id}`,
        elements: [
          {
            type: "button",
            action_id: actionIds.resultsLink,
            text: plain("See results"),
            url: resultsUrl,
          },
        ],
      },
    ],
  } satisfies Message;
}

/** To the creator when the cron could not send their scheduled Holler. */
export function sendFailedMessage(holler: SlackHoller, reason: string, editUrl: string): Message {
  return {
    text: `${holler.title} did not send. ${reason}`,
    blocks: [
      section(`${italic(holler)} did not send. ${escapeMrkdwn(reason)}`),
      {
        type: "actions",
        block_id: `fix:${holler.id}`,
        elements: [
          {
            type: "button",
            action_id: actionIds.resultsLink,
            text: plain("Open in Holler"),
            url: editUrl,
          },
        ],
      },
    ],
  };
}
