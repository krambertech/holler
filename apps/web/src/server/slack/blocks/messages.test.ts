import { describe, expect, it } from "vitest";
import { mrkdwn, type SlackHoller, type SlackQuestion, surfaceOf, when } from "./format";
import { blockKitProblems, viewProblems } from "./limits";
import {
  announcementMessage,
  answeredMessage,
  closedMessage,
  closeNoticeMessage,
  inviteMessage,
  reminderMessage,
  sendFailedMessage,
  sharedMessage,
} from "./messages";
import { answerModal, readAnswers } from "./modal";

const now = new Date("2026-11-23T09:00:00Z");
const closesAt = new Date("2026-11-27T16:00:00Z");
const reader = { timeZone: "Europe/Tallinn", now };
const webReader = { ...reader, respondUrl: "https://app.holler.team/respond/hol_web?u=UA&s=sig" };

/** A question as the editor saves it, with every extra off unless a test sets it. */
function question(
  fields: Partial<SlackQuestion> & Pick<SlackQuestion, "id" | "type">,
): SlackQuestion {
  return {
    position: 0,
    style: "plain",
    prompt: "How was your week?",
    description: "",
    required: true,
    options: [],
    allowOther: false,
    otherOptionId: null,
    maxChoices: null,
    followUp: null,
    lowLabel: null,
    highLabel: null,
    numberMin: null,
    numberMax: null,
    ...fields,
  };
}

const options = (labels: string[], prefix = "o") =>
  labels.map((label, position) => ({
    id: `${prefix}_${position}`,
    position,
    label,
    score: null,
    isOther: false,
  }));

const pulse: SlackHoller = {
  id: "hol_1",
  mode: "pulse",
  title: "How was your week?",
  description: "",
  anonymous: false,
  externalUrl: null,
  closesAt,
  senderName: "Mira",
  questions: [question({ id: "q_1", type: "single", options: options(["Good", "Fine", "Rough"]) })],
};

const textPulse: SlackHoller = {
  ...pulse,
  id: "hol_text",
  title: "What should we stop doing?",
  questions: [question({ id: "q_t", type: "text", prompt: "What should we stop doing?" })],
};

const survey: SlackHoller = {
  ...pulse,
  id: "hol_2",
  mode: "survey",
  title: "Offsite",
  description: "Two things to **decide**. See [the plan](https://example.com/plan).",
  anonymous: true,
  questions: [
    question({
      id: "q_1",
      type: "single",
      prompt: "Where?",
      options: options(["Lisbon", "Tallinn"]),
      allowOther: true,
      otherOptionId: "o_other",
      followUp: { prompt: "Why there?", onlyAfter: null },
    }),
    question({
      id: "q_2",
      type: "multi",
      prompt: "Which days?",
      required: false,
      maxChoices: 3,
      options: options(
        Array.from({ length: 12 }, (_, i) => `Day ${i + 1}`),
        "d",
      ),
    }),
    question({
      id: "q_3",
      type: "single",
      style: "scale",
      prompt: "How calm is your week?",
      options: options(["1", "2", "3", "4", "5"], "s"),
      lowLabel: "Chaos",
      highLabel: "Calm",
    }),
    question({ id: "q_4", type: "number", prompt: "How many nights?", numberMin: 1, numberMax: 7 }),
    question({ id: "q_5", type: "person", prompt: "Who should plan it?", maxChoices: 2 }),
    question({
      id: "q_6",
      type: "text",
      prompt: "Anything else?",
      required: false,
      description: "Diets, dates",
    }),
  ],
};

const webOnly: SlackHoller = {
  ...survey,
  id: "hol_web",
  questions: [
    question({
      id: "q_w",
      type: "single",
      prompt: "Which team?",
      options: options(
        Array.from({ length: 101 }, (_, i) => `Team ${i + 1}`),
        "w",
      ),
    }),
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

const valid = (message: { blocks?: unknown[]; text: string }) =>
  blockKitProblems("message", message.blocks ?? [], message.text);

interface Part {
  type?: string;
  text?: string | Part;
  elements?: Part[];
  element?: Part;
  label?: Part;
  hint?: Part;
  options?: Part[];
  placeholder?: Part;
  optional?: boolean;
  url?: string;
  style?: string;
}

const textOf = (part: Part | string | undefined): string =>
  typeof part === "object" ? textOf(part.text) : (part ?? "");

function linesOf(part: Part): string[] {
  if (part.type === "button") {
    const url = part.url ? ` ${part.url}` : "";
    return [`[${textOf(part)}]${part.style ? ` ${part.style}` : ""}${url}`];
  }
  if (part.type === "input") {
    const label = `${textOf(part.label)}${part.optional ? " (optional)" : ""}`;
    const choices = (part.element?.options ?? []).map((option) => `( ) ${textOf(option)}`);
    return [label, ...choices, ...(part.hint ? [textOf(part.hint)] : [])];
  }
  return part.elements ? part.elements.flatMap(linesOf) : textOf(part).split("\n");
}

const reads = (message: { blocks?: unknown[] | undefined }) =>
  ((message.blocks ?? []) as Part[]).flatMap(linesOf);

describe("where a Holler is answered", () => {
  it("follows answerSurface: buttons, a DM text box, the modal, the web, the chase", () => {
    expect([pulse, textPulse, survey, webOnly, chase].map((h) => surfaceOf(h).where)).toEqual([
      "dm",
      "dm",
      "slack",
      "web",
      "chase",
    ]);
  });

  it("puts up to 25 buttons in the DM", () => {
    const wide = {
      ...pulse,
      questions: [
        question({
          id: "q_1",
          type: "single",
          options: options(Array.from({ length: 25 }, String)),
        }),
      ],
    };
    const blocks = JSON.stringify(inviteMessage(wide, reader).blocks);
    expect(blocks.match(/holler_option_/g)).toHaveLength(25);
    expect(valid(inviteMessage(wide, reader))).toEqual([]);
  });

  it("asks a free-text pulse in a box in the DM that sends on Enter", () => {
    const message = inviteMessage(textPulse, reader);
    expect(message.blocks?.at(-1)).toMatchObject({
      type: "input",
      block_id: "text:hol_text:q_t",
      dispatch_action: true,
      element: {
        action_id: "holler_text",
        dispatch_action_config: { trigger_actions_on: ["on_enter_pressed"] },
      },
    });
    expect(valid(message)).toEqual([]);
  });

  it("links a web-only Holler to the person's own signed form", () => {
    expect(JSON.stringify(inviteMessage(webOnly, webReader).blocks)).toContain(
      webReader.respondUrl,
    );
    expect(() => inviteMessage(webOnly, reader)).toThrow("no link");
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
    const message = inviteMessage(pulse, reader);
    expect(message.text).toBe("Mira sent you a Holler: How was your week?");
    expect(reads(message)).toEqual([
      "_Mira_ sent you a Holler.",
      "*How was your week?*",
      "Pulse · 1 question · Closes Friday at 18:00",
      "[Good]",
      "[Fine]",
      "[Rough]",
    ]);
  });
  it("invites to a survey with Answer", () => {
    const message = inviteMessage(survey, reader);
    expect(message.text).toBe("Mira sent you a Holler: Offsite");
    expect(reads(message)).toEqual([
      "_Mira_ sent you a Holler.",
      "*Offsite*",
      "Two things to *decide*. See <https://example.com/plan|the plan>.",
      "Survey · 6 questions · Closes Friday at 18:00 · Anonymous",
      "[Answer] primary",
    ]);
  });
  it("invites to a chase", () => {
    const message = inviteMessage(chase, reader);
    expect(message.text).toBe("Mira sent you a Holler: Benefits enrolment");
    expect(reads(message)).toEqual([
      "_Mira_ sent you a Holler.",
      "*Benefits enrolment*",
      "Form chase · Closes Friday at 18:00",
      "[Open the form] https://forms.example.com/benefits",
      "[I submitted it] primary",
    ]);
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
    const back = new Date("2026-11-23T13:00:00Z");
    expect(reads(reminderMessage(survey, "gentle", reader, back))).toEqual([
      "A reminder: Mira still needs your answer to _Offsite_",
      "[Answer now] primary",
      "I'll remind you again at 15:00.",
    ]);
  });
  it("thanks with what they picked and wrote, or only that they answered anonymously", () => {
    const given = [
      { prompt: "Where?", values: ["Other: Riga"], people: [], note: "Cheap flights" },
      { prompt: "Who should plan it?", values: [], people: ["UA", "UB"], note: null },
    ];
    const named = answeredMessage({ ...survey, anonymous: false }, given);
    expect(named.text).toBe("Thanks. Your answer to Offsite is in.");
    expect(reads(named)).toEqual([
      "Thanks. Your answer to _Offsite_ is in.",
      "*Where?*",
      "Other: Riga",
      "_Cheap flights_",
      "*Who should plan it?*",
      "<@UA>, <@UB>",
    ]);
    expect(JSON.stringify(answeredMessage(survey, given))).not.toContain("Riga");
  });
  it("asks for the follow-up note under the thank-you", () => {
    const message = answeredMessage(pulse, [], {
      responseId: "res_1",
      questionId: "q_1",
      prompt: "What made it so?",
    });
    expect(message.blocks?.at(-1)).toMatchObject({
      type: "input",
      block_id: "note:res_1:q_1",
      dispatch_action: true,
      element: { action_id: "holler_note" },
    });
    expect(valid(message)).toEqual([]);
  });
  it("marks a closed Holler", () => {
    const message = closedMessage(pulse, closesAt, reader);
    expect(message.text).toBe("How was your week? closed. It takes no more answers.");
    expect(reads(message)).toEqual([
      "_How was your week?_ closed on Friday at 18:00. It takes no more answers.",
      "From Mira",
    ]);
  });
  it("announces in a channel without naming who answered", () => {
    const message = announcementMessage(pulse, { answered: 7, recipients: 12 }, false);
    expect(message.text).toBe("Mira sent a Holler to 12 people: How was your week?");
    expect(reads(message)).toEqual([
      "Mira sent a Holler to 12 people: _How was your week?_",
      "7 of 12 answered",
    ]);
    expect(announcementMessage(pulse, { answered: 1, recipients: 1 }, true).text).toBe(
      "Mira sent a Holler to 1 person: How was your week?",
    );
  });
  it("tells the creator it closed, or that it did not send", () => {
    const results = "https://app.test/hollers/hol_1";
    const notice = closeNoticeMessage(pulse, { answered: 11, recipients: 12 }, results);
    expect(notice.text).toBe("How was your week? closed. 11 of 12 answered.");
    expect(reads(notice)).toEqual([
      "_How was your week?_ closed. 11 of 12 answered.",
      `[See results] ${results}`,
    ]);
    expect(
      sendFailedMessage(pulse, "You have sent 5 hollers this month.", "https://app.test").text,
    ).toBe("How was your week? did not send. You have sent 5 hollers this month.");
  });
  it("tells someone a Holler's results were shared with them", () => {
    const results = "https://app.test/hollers/hol_1";
    const message = sharedMessage(pulse, "U0MIRA", results);
    expect(message.text).toBe("<@U0MIRA> shared the results of How was your week? with you.");
    expect(reads(message)).toEqual([
      "<@U0MIRA> shared the results of _How was your week?_ with you.",
      `[See results] ${results}`,
    ]);
    expect(valid(message)).toEqual([]);
  });
});

describe("answer modal", () => {
  const modal = answerModal(survey, { hollerId: survey.id, channel: "DA", ts: "1.1" });
  const block = (label: string) => {
    const found = (modal.blocks as (Part & { block_id?: string })[]).find(
      (b) => textOf(b.label) === label,
    );
    if (!found?.block_id) throw new Error(`no input labelled ${label}`);
    return { ...found, block_id: found.block_id };
  };

  it("builds each question type's element from docs/slack.md", () => {
    expect(reads(modal)).toEqual([
      "*Offsite*",
      "Two things to *decide*. See <https://example.com/plan|the plan>.",
      "Anonymous. Your name is not kept with your answers.",
      "Where?",
      "( ) Lisbon",
      "( ) Tallinn",
      "( ) Other",
      "If Other, what? (optional)",
      "Why there? (optional)",
      "Which days? Pick up to 3. (optional)",
      ...Array.from({ length: 12 }, (_, i) => `( ) Day ${i + 1}`),
      "How calm is your week?",
      "( ) 1, Chaos",
      "( ) 2",
      "( ) 3",
      "( ) 4",
      "( ) 5, Calm",
      "How many nights?",
      "Who should plan it? Pick up to 2.",
      "Anything else? (optional)",
      "Diets, dates",
    ]);
    expect([modal.title, modal.submit, modal.close].map((part) => textOf(part as Part))).toEqual([
      "Answer",
      "Send",
      "Cancel",
    ]);
    expect(block("Where?")).toMatchObject({ element: { type: "radio_buttons" } });
    expect(JSON.stringify(block("Where?"))).toContain('"value":"o_other"');
    expect(block("If Other, what?")).toMatchObject({ element: { max_length: 1000 } });
    expect(block("Why there?")).toMatchObject({ element: { max_length: 3000, multiline: true } });
    expect(block("Which days? Pick up to 3.")).toMatchObject({
      element: { type: "multi_static_select", max_selected_items: 3 },
    });
    expect(block("How many nights?")).toMatchObject({
      element: { type: "number_input", is_decimal_allowed: false, min_value: "1", max_value: "7" },
    });
    expect(block("Who should plan it? Pick up to 2.")).toMatchObject({
      element: { type: "multi_users_select", max_selected_items: 2 },
    });
    expect(block("Anything else?")).toMatchObject({
      element: { type: "plain_text_input", max_length: 3000, multiline: true },
    });
    expect(viewProblems(modal)).toEqual([]);
  });

  it("shows what a sender typed, never an emoji Slack made of it", () => {
    const words = JSON.stringify([modal, inviteMessage(pulse, reader)]);
    const count = (text: string) => words.split(text).length - 1;
    expect(count('"type":"plain_text"')).toBeGreaterThan(0);
    expect(count('"emoji":false')).toBe(count('"type":"plain_text"'));
  });

  it("reads its state back as a response", () => {
    expect(
      readAnswers({
        [block("Where?").block_id]: {
          value: { type: "radio_buttons", selected_option: { value: "o_other" } },
        },
        [block("If Other, what?").block_id]: {
          value: { type: "plain_text_input", value: " Riga " },
        },
        [block("Why there?").block_id]: {
          value: { type: "plain_text_input", value: "Cheap flights" },
        },
        [block("Which days? Pick up to 3.").block_id]: {
          value: {
            type: "multi_static_select",
            selected_options: [{ value: "d_0" }, { value: "d_3" }],
          },
        },
        [block("How many nights?").block_id]: { value: { type: "number_input", value: "3" } },
        [block("Who should plan it? Pick up to 2.").block_id]: {
          value: { type: "multi_users_select", selected_users: ["UA", "UB"] },
        },
        [block("Anything else?").block_id]: { value: { type: "plain_text_input", value: "" } },
        other: { value: { type: "plain_text_input", value: "ignored" } },
      }),
    ).toEqual({
      answers: [
        { questionId: "q_1", optionIds: ["o_other"], otherText: "Riga", note: "Cheap flights" },
        { questionId: "q_2", optionIds: ["d_0", "d_3"] },
        { questionId: "q_4", number: 3 },
        { questionId: "q_5", slackUserIds: ["UA", "UB"] },
        { questionId: "q_6", text: null },
      ],
    });
  });
});

describe("every message fits Slack's limits", () => {
  // The largest Holler the draft schema allows, in the characters that grow most when escaped.
  const long = (length: number) => "&".repeat(length);
  const types = ["single", "multi", "text", "number", "person"] as const;
  const biggest = (
    mode: SlackHoller["mode"],
    questionCount: number,
    optionCount = 99,
  ): SlackHoller => ({
    id: "hol_0123456789abcdef",
    mode,
    title: long(150),
    description: long(4000),
    anonymous: false,
    externalUrl: `https://forms.example.com/${"x".repeat(1900)}`,
    closesAt,
    senderName: long(80),
    questions: Array.from({ length: questionCount }, (_, q) => {
      const type = types[q % types.length] ?? "text";
      const choice = type === "single" || type === "multi";
      return question({
        id: `que_${q}_0123456789`,
        type,
        prompt: long(300),
        description: long(500),
        required: q % 2 === 0,
        options: choice
          ? Array.from({ length: optionCount }, (_, i) => ({
              id: `opt_${q}_${i}_padding`,
              position: i,
              label: long(150),
              score: null,
              isOther: false,
            }))
          : [],
        allowOther: choice,
        otherOptionId: choice ? `opt_${q}_other` : null,
        maxChoices: type === "multi" || type === "person" ? 5 : null,
        followUp: choice ? { prompt: long(300), onlyAfter: null } : null,
        lowLabel: long(40),
        highLabel: long(40),
        numberMin: type === "number" ? -1000 : null,
        numberMax: type === "number" ? 1000 : null,
      });
    }),
  });
  const onePulse: SlackHoller = {
    ...biggest("pulse", 1, 25),
    questions: [
      {
        ...(biggest("pulse", 1, 25).questions[0] as SlackQuestion),
        allowOther: false,
        otherOptionId: null,
      },
    ],
  };
  const hollers = [
    onePulse,
    {
      ...textPulse,
      title: long(150),
      description: long(4000),
      questions: [question({ id: "q", type: "text", prompt: long(300) })],
    },
    biggest("pulse", 2),
    // 30 questions with Other and notes on the choices is over 100 blocks, so it goes to the web.
    biggest("survey", 30),
    biggest("survey", 20),
    biggest("chase", 0),
  ];
  const answers = Array.from({ length: 30 }, () => ({
    prompt: long(300),
    values: [long(4000)],
    people: ["U0123456789"],
    note: long(4000),
  }));

  for (const holler of hollers) {
    const where = surfaceOf(holler).where;
    it(`${holler.mode} with ${holler.questions.length} questions, answered in ${where}`, () => {
      const read = {
        ...reader,
        respondUrl: `https://app.holler.team/respond/${holler.id}?u=U0123456789&s=${"x".repeat(43)}`,
      };
      const messages = [
        inviteMessage(holler, read),
        ...(["gentle", "nudge", "last"] as const).map((tone) =>
          reminderMessage(holler, tone, read),
        ),
        reminderMessage(holler, "gentle", read, closesAt),
        answeredMessage(holler, answers, {
          responseId: "res_0123456789",
          questionId: "que_0_0123456789",
          prompt: long(300),
        }),
        answeredMessage({ ...holler, anonymous: true }, answers),
        closedMessage(holler, closesAt, reader),
        announcementMessage(holler, { answered: 1999, recipients: 2000 }, true),
        closeNoticeMessage(holler, { answered: 1, recipients: 1 }, "https://app.holler.team/x"),
        sendFailedMessage(holler, long(300), "https://app.holler.team/x"),
        sharedMessage(holler, "U0123456789", "https://app.holler.team/x"),
      ];
      for (const message of messages) expect(valid(message)).toEqual([]);
      if (where === "slack" || where === "dm") {
        const view = answerModal(holler, {
          hollerId: holler.id,
          channel: "D0123456789",
          ts: "1700000000.000100",
        });
        expect(viewProblems(view)).toEqual([]);
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
        { type: "video" },
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
      "block 3 (input) is an input in a message without dispatch_action",
      "block 3 (input) has no element",
      "block 4 (video) is a block type Holler does not build",
    ]);
  });

  it("checks headers, section fields and a section's accessory button", () => {
    const problems = blockKitProblems("home", [
      { type: "header", text: { type: "plain_text", text: "x".repeat(151) } },
      {
        type: "section",
        fields: [{ type: "mrkdwn", text: "" }, ...Array(10).fill({ type: "mrkdwn", text: "ok" })],
      },
      { type: "section" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "Row" },
        accessory: {
          type: "button",
          action_id: "go",
          text: { type: "plain_text", text: "x".repeat(76) },
        },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: "Row" },
        accessory: { type: "image", action_id: "pic" },
      },
      { type: "divider" },
    ]);
    expect(problems).toEqual([
      "block 0 (header) text length is 151, over Slack's 150",
      "block 1 (section) fields is 11, over Slack's 10",
      "block 1 (section) field 0 is empty",
      "block 2 (section) has no text",
      "block 3 (section) accessory text length is 76, over Slack's 75",
      "block 3 (section) accessory has neither a value nor a url",
      "block 4 (section) accessory image is not one Holler builds",
    ]);
  });
});
