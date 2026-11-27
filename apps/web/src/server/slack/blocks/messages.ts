import type { ReminderTone } from "@holler/core";
import type { PostMessage } from "../client";
import {
  actionIds,
  context,
  contextLine,
  escapeMrkdwn,
  mrkdwn,
  plain,
  type SlackHoller,
  section,
  sections,
  surfaceOf,
  timeOfDay,
  when,
} from "./format";

/**
 * Every message Holler posts, as pure functions of the Holler and the reader's time zone. Each
 * sets `text` to the point, because notifications and screen readers read only that. No emoji.
 * docs/slack.md, Messages.
 */
type Message = Omit<PostMessage, "channel">;

export interface Reader {
  /** The reader's IANA zone, for "Closes Friday at 18:00". */
  timeZone: string | null;
  now: Date;
  /** Their signed link to the web form. Set when the Holler is answered on the web. */
  respondUrl?: string | null | undefined;
}

const title = (holler: SlackHoller) => `*${escapeMrkdwn(holler.title)}*`;
const italic = (holler: SlackHoller) => `_${escapeMrkdwn(holler.title)}_`;

function heading(holler: SlackHoller, reader: Reader) {
  const blocks: unknown[] = [section(title(holler))];
  if (holler.description.trim()) blocks.push(...sections(mrkdwn(holler.description)));
  blocks.push(context(contextLine(holler, reader.timeZone, reader.now)));
  return blocks;
}

/**
 * A text box in the DM that sends on Enter, for a free-text pulse and for the note after a tap.
 * Slack takes an input block in a message only with `dispatch_action`.
 */
export function dmTextBox(blockId: string, actionId: string, label: string, hint: string) {
  return {
    type: "input",
    block_id: blockId,
    dispatch_action: true,
    label: plain(label, 2000),
    hint: plain(hint, 2000),
    element: {
      type: "plain_text_input",
      action_id: actionId,
      multiline: false,
      max_length: 3000,
      dispatch_action_config: { trigger_actions_on: ["on_enter_pressed"] },
    },
  };
}

const button = (fields: Record<string, unknown>) => ({
  type: "actions",
  elements: [{ type: "button", ...fields }],
});

/** The answer controls for each answer surface: buttons, a text box, Answer, or the form's two. */
function controls(holler: SlackHoller, label: string, reader: Reader): unknown[] {
  const surface = surfaceOf(holler);
  const question = holler.questions[0];
  if (surface.where === "dm" && question?.type === "text") {
    return [
      dmTextBox(
        `text:${holler.id}:${question.id}`,
        actionIds.text,
        question.prompt,
        "Press Enter to send.",
      ),
    ];
  }
  if (surface.where === "dm" && question) {
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
  if (surface.where === "chase") {
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
  if (surface.where === "web") {
    if (!reader.respondUrl)
      throw new Error(`Holler ${holler.id} is answered on the web, with no link`);
    return [
      {
        ...button({
          action_id: actionIds.respondLink,
          text: plain(label),
          style: "primary",
          url: reader.respondUrl,
        }),
        block_id: `answer:${holler.id}`,
      },
    ];
  }
  return [
    {
      ...button({
        action_id: actionIds.open,
        text: plain(label),
        style: "primary",
        value: holler.id,
      }),
      block_id: `answer:${holler.id}`,
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
      ...controls(holler, "Answer", reader),
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
  const blocks: unknown[] = [section(words.mrkdwn), ...controls(holler, "Answer now", reader)];
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
  /** The picked labels, or what they wrote. Empty when they skipped an optional question. */
  values: string[];
  /** The Slack ids of the people a person question named, shown as mentions. */
  people: string[];
  note: string | null;
}

/** The follow-up note a tap asks for, in the DM, until they write one. */
export interface NoteBox {
  responseId: string;
  questionId: string;
  prompt: string;
}

/**
 * Replaces the invite or reminder once they answer, so the DM never shows a stale question.
 * After a tap on a question with a follow-up, it asks for the optional note.
 */
export function answeredMessage(
  holler: SlackHoller,
  answers: AnswerSummary[],
  noteBox: NoteBox | null = null,
): Message {
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
      const given = [
        ...answer.values.map((value) => escapeMrkdwn(value)),
        ...answer.people.map((id) => `<@${id}>`),
      ];
      if (given.length === 0) continue;
      const note = answer.note ? `\n_${escapeMrkdwn(answer.note)}_` : "";
      blocks.push(context(`*${escapeMrkdwn(answer.prompt)}*\n${given.join(", ")}${note}`));
    }
  }
  if (noteBox) {
    blocks.push(
      dmTextBox(
        // The response id rides in the person's own message, so a note on an anonymous Holler
        // finds its response without Holler storing who wrote it.
        `note:${noteBox.responseId}:${noteBox.questionId}`,
        actionIds.note,
        noteBox.prompt,
        "Optional. Press Enter to send.",
      ),
    );
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

export function sharedMessage(holler: SlackHoller, sharedBy: string, resultsUrl: string): Message {
  return {
    text: `<@${sharedBy}> shared the results of ${holler.title} with you.`,
    blocks: [
      section(`<@${sharedBy}> shared the results of ${italic(holler)} with you.`),
      {
        type: "actions",
        block_id: `shared:${holler.id}`,
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
  };
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
