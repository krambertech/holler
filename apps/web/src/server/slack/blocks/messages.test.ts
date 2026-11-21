import { describe, expect, it } from "vitest";
import { answerKind, mrkdwn, type SlackHoller, when } from "./format";
import { blockKitProblems, viewProblems } from "./limits";
import {
  announcementMessage,
  answeredMessage,
  closedMessage,
  closeNoticeMessage,
  inviteMessage,
  reminderMessage,
  sendFailedMessage,
} from "./messages";
import { answerModal, readAnswers } from "./modal";

const now = new Date("2026-11-23T09:00:00Z");
const closesAt = new Date("2026-11-27T16:00:00Z");
const reader = { timeZone: "Europe/Tallinn", now };

const pulse: SlackHoller = {
  id: "hol_1",
  mode: "pulse",
  title: "How was your week?",
  description: "",
  anonymous: false,
  externalUrl: null,
  closesAt,
  senderName: "Mira",
  questions: [
    {
      id: "q_1",
      type: "single",
      prompt: "How was your week?",
      required: true,
      options: [
        { id: "o_1", label: "Good" },
        { id: "o_2", label: "Fine" },
        { id: "o_3", label: "Rough" },
      ],
    },
  ],
};

const survey: SlackHoller = {
  ...pulse,
  id: "hol_2",
  mode: "survey",
  title: "Offsite",
  description: "Two things to **decide**. See [the plan](https://example.com/plan).",
  anonymous: true,
  questions: [
    { ...(pulse.questions[0] as SlackHoller["questions"][number]), prompt: "Where?" },
    {
      id: "q_2",
      type: "multi",
      prompt: "Which days?",
      required: false,
      options: Array.from({ length: 12 }, (_, i) => ({ id: `d_${i}`, label: `Day ${i + 1}` })),
    },
    { id: "q_3", type: "text", prompt: "Anything else?", required: false, options: [] },
  ],
};

const chase: SlackHoller = {
  ...pulse,
  id: "hol_3",
  mode: "chase",
  title: "Benefits enrolment",
  externalUrl: "https://forms.example.com/benefits",
  questions: [],
};

describe("answerKind", () => {
  it("answers a small single-choice pulse in one tap", () => {
    expect(answerKind(pulse)).toBe("one_tap");
  });
  it("opens a modal for a survey", () => {
    expect(answerKind(survey)).toBe("modal");
  });
  it("links out for a form chase", () => {
    expect(answerKind(chase)).toBe("chase");
  });
  it("opens a modal for a pulse with more than five options", () => {
    const wide = {
      ...pulse,
      questions: [
        {
          ...(pulse.questions[0] as SlackHoller["questions"][number]),
          options: Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, label: `${i}` })),
        },
      ],
    };
    expect(answerKind(wide)).toBe("modal");
  });
});

describe("format", () => {
  it("names the day within a week and the date past it, in the reader's zone", () => {
    expect(when(closesAt, "Europe/Tallinn", now)).toBe("Friday at 18:00");
    expect(when(new Date("2026-12-04T16:00:00Z"), "Europe/Tallinn", now)).toBe(
      "4 December at 18:00",
    );
  });
  it("turns Markdown into mrkdwn and escapes Slack's markup", () => {
    expect(mrkdwn("**Bold** & [a link](https://x.test) <b>")).toBe(
      "*Bold* &amp; <https://x.test|a link> &lt;b&gt;",
    );
  });
});

describe("messages", () => {
  it("invites to a one-tap pulse", () => {
    expect(inviteMessage(pulse, reader)).toMatchSnapshot();
  });
  it("invites to a survey with Answer", () => {
    expect(inviteMessage(survey, reader)).toMatchSnapshot();
  });
  it("invites to a form chase", () => {
    expect(inviteMessage(chase, reader)).toMatchSnapshot();
  });
  it("reminds in three tones, with Remind me later before the last", () => {
    expect(reminderMessage(pulse, "gentle", reader).text).toBe(
      "A reminder: Mira still needs your answer to How was your week?",
    );
    expect(reminderMessage(pulse, "nudge", reader).text).toBe(
      "Mira is still waiting on your answer to How was your week? It takes a minute.",
    );
    expect(reminderMessage(pulse, "last", reader).text).toBe(
      "Last reminder: How was your week? closes Friday at 18:00.",
    );
    expect(JSON.stringify(reminderMessage(pulse, "gentle", reader))).toContain("Remind me later");
    expect(JSON.stringify(reminderMessage(pulse, "last", reader))).not.toContain("Remind me later");
  });
  it("says when a snoozed reminder comes back", () => {
    expect(
      reminderMessage(survey, "gentle", reader, new Date("2026-11-23T13:00:00Z")),
    ).toMatchSnapshot();
  });
  it("thanks with what they picked, or only that they answered anonymously", () => {
    const given = [{ prompt: "Where?", values: ["Good"] }];
    expect(answeredMessage(pulse, given)).toMatchSnapshot();
    expect(JSON.stringify(answeredMessage(survey, given))).not.toContain("Good");
  });
  it("marks a closed Holler", () => {
    expect(closedMessage(pulse, closesAt, reader)).toMatchSnapshot();
  });
  it("announces in a channel without naming who answered", () => {
    expect(announcementMessage(pulse, { answered: 7, recipients: 12 }, false)).toMatchSnapshot();
    expect(announcementMessage(pulse, { answered: 1, recipients: 1 }, true).text).toBe(
      "Mira sent a Holler to 1 person: How was your week?",
    );
  });
  it("tells the creator it closed, or that it did not send", () => {
    expect(
      closeNoticeMessage(pulse, { answered: 11, recipients: 12 }, "https://app.test/hollers/hol_1"),
    ).toMatchSnapshot();
    expect(
      sendFailedMessage(pulse, "You have sent 5 hollers this month.", "https://app.test").text,
    ).toBe("How was your week? did not send. You have sent 5 hollers this month.");
  });
});

describe("answer modal", () => {
  it("uses radio buttons, a select above ten options, and a text box", () => {
    expect(
      answerModal(survey, { hollerId: survey.id, channel: "DA", ts: "1.1" }),
    ).toMatchSnapshot();
  });
  it("reads its state back as a response", () => {
    expect(
      readAnswers({
        "q:q_1": { value: { type: "radio_buttons", selected_option: { value: "o_2" } } },
        "q:q_2": {
          value: {
            type: "multi_static_select",
            selected_options: [{ value: "d_0" }, { value: "d_3" }],
          },
        },
        "q:q_3": { value: { type: "plain_text_input", value: "Snacks" } },
        other: { value: { type: "plain_text_input", value: "ignored" } },
      }),
    ).toEqual({
      answers: [
        { questionId: "q_1", optionIds: ["o_2"] },
        { questionId: "q_2", optionIds: ["d_0", "d_3"] },
        { questionId: "q_3", text: "Snacks" },
      ],
    });
  });
});

describe("every message fits Slack's limits", () => {
  // The largest Holler the draft schema allows, in the characters that grow most when escaped.
  const long = (length: number) => "&".repeat(length);
  const option = (q: number, i: number) => ({ id: `opt_${q}_${i}_padding`, label: long(150) });
  const biggest = (mode: SlackHoller["mode"], questionCount: number): SlackHoller => ({
    id: "hol_0123456789abcdef",
    mode,
    title: long(150),
    description: long(4000),
    anonymous: false,
    externalUrl: `https://forms.example.com/${"x".repeat(1900)}`,
    closesAt,
    senderName: long(80),
    questions: Array.from({ length: questionCount }, (_, q) => ({
      id: `que_${q}_0123456789`,
      type: q % 3 === 0 ? "single" : q % 3 === 1 ? "multi" : "text",
      prompt: long(300),
      required: q % 2 === 0,
      options: q % 3 === 2 ? [] : Array.from({ length: 100 }, (_, i) => option(q, i)),
    })),
  });
  const onePulse: SlackHoller = {
    ...biggest("pulse", 1),
    questions: [
      {
        ...(biggest("pulse", 1).questions[0] as SlackHoller["questions"][number]),
        options: Array.from({ length: 5 }, (_, i) => option(0, i)),
      },
    ],
  };
  const hollers = [onePulse, biggest("pulse", 2), biggest("survey", 30), biggest("chase", 0)];
  const answers = Array.from({ length: 30 }, () => ({ prompt: long(300), values: [long(4000)] }));

  for (const holler of hollers) {
    it(`${holler.mode} with ${holler.questions.length} questions`, () => {
      const messages = [
        inviteMessage(holler, reader),
        ...(["gentle", "nudge", "last"] as const).map((tone) =>
          reminderMessage(holler, tone, reader),
        ),
        reminderMessage(holler, "gentle", reader, closesAt),
        answeredMessage(holler, answers),
        answeredMessage({ ...holler, anonymous: true }, answers),
        closedMessage(holler, closesAt, reader),
        announcementMessage(holler, { answered: 1999, recipients: 2000 }, true),
        closeNoticeMessage(holler, { answered: 1, recipients: 1 }, "https://app.holler.team/x"),
        sendFailedMessage(holler, long(300), "https://app.holler.team/x"),
      ];
      for (const message of messages) {
        expect(blockKitProblems("message", message.blocks ?? [], message.text)).toEqual([]);
      }
      if (holler.mode !== "chase") {
        expect(
          viewProblems(
            answerModal(holler, {
              hollerId: holler.id,
              channel: "D0123456789",
              ts: "1700000000.000100",
            }),
          ),
        ).toEqual([]);
      }
    });
  }

  it("splits a long description without cutting an escape in half", () => {
    const blocks = inviteMessage(biggest("survey", 1), reader).blocks as {
      text?: { text: string };
    }[];
    for (const block of blocks) {
      if (block.text) expect(block.text.text).not.toMatch(/&(?!amp;|lt;|gt;)|&a(?!mp;)/);
    }
  });
});

describe("blockKitProblems", () => {
  it("names each limit a payload breaks", () => {
    const problems = blockKitProblems(
      "message",
      [
        { type: "section", text: { type: "mrkdwn", text: "x".repeat(3001) } },
        {
          type: "actions",
          block_id: "same",
          elements: [
            { type: "button", action_id: "a", text: { type: "mrkdwn", text: "x".repeat(76) } },
            {
              type: "button",
              action_id: "a",
              text: { type: "plain_text", text: "ok" },
              value: "v",
            },
          ],
        },
        { type: "actions", block_id: "same", elements: [] },
        { type: "input", label: { type: "plain_text", text: "Q" } },
        { type: "header" },
      ],
      " ",
    );
    expect(problems).toEqual([
      "message text is empty; notifications read it",
      "block 0 (section) text length is 3001, over Slack's 3000",
      "block 1 (actions) element 0 text must be plain_text",
      "block 1 (actions) element 0 text length is 76, over Slack's 75",
      "block 1 (actions) element 0 has neither a value nor a url",
      "block 1 (actions) element 1 repeats action_id a",
      "block 2 (actions) repeats block_id same",
      "block 2 (actions) has no elements",
      "block 3 (input) is an input, which only a view can hold",
      "block 3 (input) has no element",
      "block 4 (header) is a block type Holler does not build",
    ]);
  });
});
