import { hollerDraftSchema } from "@holler/core";
import { describe, expect, it } from "vitest";
import manifest from "../../../../../../slack-app-manifest.json";
import { sendProblems } from "../../services/hollers";
import { helpMessage, resultsMessage, signInMessage } from "./commands";
import { aboutMessageShortcutId, type SlackHoller } from "./format";
import { type HomeLive, type HomeState, homeRowLimit, homeView } from "./home";
import { blockKitLimits, blockKitProblems, viewProblems } from "./limits";
import {
  emptyQuickPulse,
  quickBlocks,
  quickFailedView,
  quickKinds,
  quickPulseDraft,
  quickPulseModal,
  quickSendingView,
  quickSentView,
  readQuickValues,
  signInView,
} from "./quick-pulse";

const NOW = new Date("2026-11-20T10:00:00Z");
const HOUR = 3600_000;
const productUrl = "https://app.holler.team";

function holler(over: Partial<SlackHoller> = {}): SlackHoller {
  return {
    id: "h_week",
    mode: "pulse",
    title: "How was your week?",
    description: "",
    anonymous: false,
    externalUrl: null,
    closesAt: new Date(NOW.getTime() + 48 * HOUR),
    senderName: "Mira Kask",
    questions: [
      {
        id: "q1",
        position: 0,
        type: "single",
        style: "plain",
        prompt: "How was your week?",
        description: "",
        required: true,
        options: ["Great", "Fine", "Rough"].map((label, position) => ({
          id: `o${position}`,
          position,
          label,
          score: null,
          isOther: false,
        })),
        allowOther: false,
        maxChoices: null,
        followUp: null,
        lowLabel: null,
        highLabel: null,
        numberMin: null,
        numberMax: null,
        otherOptionId: null,
      },
    ],
    ...over,
  };
}

const live = (over: Partial<HomeLive> = {}): HomeLive => ({
  id: "h_offsite",
  title: "Where should the offsite be?",
  answered: 7,
  recipients: 12,
  closesAt: new Date(NOW.getTime() + 30 * HOUR),
  remind: { status: "ready" },
  ...over,
});

function state(over: Partial<HomeState> = {}): HomeState {
  return {
    sender: {
      counts: { live: 3, waiting: 9, scheduled: 1 },
      live: [
        live(),
        live({
          id: "h_retro",
          title: "Sprint retro",
          answered: 3,
          recipients: 5,
          remind: {
            status: "wait",
            last: new Date(NOW.getTime() - HOUR),
            next: new Date(NOW.getTime() + 3 * HOUR),
          },
        }),
        live({
          id: "h_done",
          title: "Laptop survey",
          answered: 4,
          recipients: 4,
          remind: { status: "nobody" },
        }),
      ],
      moreLive: 0,
    },
    waiting: [
      { holler: holler(), respondUrl: null },
      {
        holler: holler({
          id: "h_form",
          mode: "chase",
          title: "Expense form",
          questions: [],
          externalUrl: "https://forms.example/expenses",
        }),
        respondUrl: null,
      },
    ],
    moreWaiting: 0,
    timeZone: "Europe/Tallinn",
    now: NOW,
    productUrl,
    ...over,
  };
}

const texts = (blocks: unknown[]) => JSON.stringify(blocks);

describe("App Home", () => {
  it("puts what is waiting on them first, then their own hollers", () => {
    const view = homeView(state());
    expect(viewProblems(view)).toEqual([]);
    expect(view).toMatchSnapshot();
  });

  it("leads with the sender's hollers when nothing is waiting on them", () => {
    const view = homeView(state({ waiting: [] }));
    const headers = view.blocks.filter((b) => (b as { type: string }).type === "header");
    expect(headers.map((h) => (h as { text: { text: string } }).text.text)).toEqual([
      "Your hollers",
      "Waiting on you",
    ]);
    expect(texts(view.blocks)).toContain("Nothing is waiting on you.");
  });

  it("offers Send reminder only when it can go, and says when it can otherwise", () => {
    const blocks = texts(homeView(state()).blocks);
    expect(blocks.match(/"Send reminder"/g)).toHaveLength(1);
    expect(blocks).toContain("Reminded at 11:00. You can remind again at 15:00.");
    expect(blocks).toContain("4 of 4 answered");
  });

  it("answers each kind of Holler the way its DM would", () => {
    const view = homeView(
      state({
        sender: null,
        waiting: [
          { holler: holler(), respondUrl: null },
          {
            holler: holler({ id: "h_web", description: "x" }),
            respondUrl: `${productUrl}/respond/h_web?u=U&s=sig`,
          },
          {
            holler: holler({
              id: "h_form",
              mode: "chase",
              questions: [],
              externalUrl: "https://forms.example/x",
            }),
            respondUrl: null,
          },
        ],
      }),
    );
    const json = texts(view.blocks);
    expect(json).toContain(
      '"action_id":"holler_open","text":{"type":"plain_text","text":"Answer","emoji":false},"value":"h_week"',
    );
    expect(json).toContain('"action_id":"holler_done"');
    expect(json).toContain('"url":"https://forms.example/x"');
  });

  it("tells someone who has not signed in how to send their own", () => {
    const view = homeView(state({ sender: null, waiting: [] }));
    expect(viewProblems(view)).toEqual([]);
    expect(view).toMatchSnapshot();
  });

  it("fits Block Kit's limits at its fullest", () => {
    const long = "W".repeat(150);
    const view = homeView(
      state({
        sender: {
          counts: { live: 99_999, waiting: 999_999, scheduled: 9_999 },
          live: Array.from({ length: homeRowLimit }, (_, i) =>
            live({
              id: `h_live_${i}_${"x".repeat(30)}`,
              title: long,
              answered: 4_999,
              recipients: 5_000,
              remind: { status: "wait", last: NOW, next: NOW },
            }),
          ),
          moreLive: 400,
        },
        waiting: Array.from({ length: homeRowLimit }, (_, i) => ({
          holler: holler({
            id: `h_wait_${i}_${"x".repeat(30)}`,
            mode: "chase",
            title: long,
            senderName: "S".repeat(80),
            questions: [],
            externalUrl: `https://forms.example/${"p".repeat(2000)}`,
          }),
          respondUrl: null,
        })),
        moreWaiting: 400,
      }),
    );
    expect(viewProblems(view)).toEqual([]);
    expect(view.blocks.length).toBeLessThanOrEqual(blockKitLimits.viewBlocks);
  });

  it("writes one and many as their own sentences", () => {
    const sender = state().sender;
    if (!sender) throw new Error("the default state has a sender");
    const one = texts(
      homeView(state({ moreWaiting: 1, sender: { ...sender, moreLive: 1 } })).blocks,
    );
    expect(one).toContain("And 1 more live Holler.");
    expect(one).toContain("And 1 more. Answer the ones above and it shows up here.");
    const many = texts(
      homeView(state({ moreWaiting: 2, sender: { ...sender, moreLive: 2 } })).blocks,
    );
    expect(many).toContain("And 2 more live hollers.");
    expect(many).toContain("And 2 more. Answer the ones above and they show up here.");
  });
});

describe("the quick pulse", () => {
  const fill = (over: Partial<typeof emptyQuickPulse> = {}) => ({
    ...emptyQuickPulse,
    prompt: "Pizza or tacos on Friday?",
    options: "Pizza\nTacos\n",
    people: ["UA", "UB"],
    ...over,
  });

  it("fits Slack's modal limits in every way it can be drawn", () => {
    for (const kind of quickKinds) {
      for (const about of [null, { url: "https://acme.slack.com/archives/C1/p1700000000000100" }]) {
        const view = quickPulseModal({ about }, fill({ kind: kind.id }), productUrl);
        expect(viewProblems(view), kind.id).toEqual([]);
      }
    }
    expect(quickPulseModal({ about: null }, emptyQuickPulse, productUrl)).toMatchSnapshot();
  });

  it("shows the options box only for options the sender writes", () => {
    const blockIds = (kind: (typeof quickKinds)[number]["id"]) =>
      quickPulseModal({ about: null }, fill({ kind }), productUrl).blocks.map(
        (b) => (b as { block_id?: string }).block_id,
      );
    expect(blockIds("options")).toContain(quickBlocks.options);
    expect(blockIds("binary")).not.toContain(quickBlocks.options);
  });

  it("makes a draft every door would send, for each kind of answer", () => {
    for (const kind of quickKinds) {
      const read = quickPulseDraft({ about: null }, fill({ kind: kind.id }));
      if (!("draft" in read)) throw new Error(`${kind.id}: ${JSON.stringify(read.errors)}`);
      const draft = hollerDraftSchema.parse(read.draft);
      expect(sendProblems({ ...draft, repeatRule: draft.repeat }, NOW), kind.id).toEqual([]);
    }
  });

  it("links the message a shortcut was used on in the description", () => {
    const url = "https://acme.slack.com/archives/C1/p1700000000000100";
    const read = quickPulseDraft({ about: { url } }, fill());
    expect("draft" in read && read.draft.description).toBe(`About [this message](${url}).`);
  });

  it("names every missing field at once, beside its block", () => {
    const read = quickPulseDraft({ about: null }, { ...emptyQuickPulse, options: "Only one" });
    expect(read).toEqual({
      errors: {
        [quickBlocks.prompt]: "Write the question.",
        [quickBlocks.options]: "Write at least two options, one on each line.",
        [quickBlocks.people]: "Choose people or a channel to send it to.",
      },
    });
  });

  it("refuses an option too long for a button", () => {
    const read = quickPulseDraft({ about: null }, fill({ options: `Short\n${"x".repeat(76)}` }));
    expect(read).toEqual({
      errors: {
        [quickBlocks.options]: "Keep each option under 75 characters, so it fits a button.",
      },
    });
  });

  it("reads back what the modal holds, so a redraw keeps it", () => {
    expect(
      readQuickValues({
        [quickBlocks.prompt]: { value: { type: "plain_text_input", value: "  Lunch?  " } },
        [quickBlocks.kind]: {
          holler_quick_kind: { type: "static_select", selected_option: { value: "binary" } },
        },
        [quickBlocks.people]: { value: { type: "multi_users_select", selected_users: ["UA"] } },
        [quickBlocks.channels]: {
          value: { type: "multi_channels_select", selected_channels: ["C1"] },
        },
        [quickBlocks.closes]: {
          value: { type: "static_select", selected_option: { value: "168" } },
        },
        [quickBlocks.anonymous]: {
          value: { type: "checkboxes", selected_options: [{ value: "anonymous" }] },
        },
      }),
    ).toEqual({
      prompt: "Lunch?",
      kind: "binary",
      options: "",
      people: ["UA"],
      channels: ["C1"],
      closeHours: 168,
      anonymous: true,
    });
  });

  it("draws its outcomes inside Slack's limits", () => {
    const sent = { hollerId: "h1", prompt: "P".repeat(300), recipients: 1, closesAt: NOW };
    for (const view of [
      quickSendingView("P".repeat(300)),
      quickSentView(sent, { timeZone: "Europe/Tallinn", now: NOW }, productUrl),
      quickSentView({ ...sent, recipients: 12 }, { timeZone: null, now: NOW }, productUrl),
      quickFailedView({ hollerId: "h1", message: "M".repeat(400) }, productUrl),
      quickFailedView({ hollerId: null, message: "M".repeat(400) }, productUrl),
      signInView(productUrl),
    ]) {
      expect(viewProblems(view)).toEqual([]);
    }
    expect(texts(quickSentView(sent, { timeZone: null, now: NOW }, productUrl).blocks)).toContain(
      "went to 1 person.",
    );
  });
});

describe("/holler replies", () => {
  it("fit a message's limits, the longest list included", () => {
    const rows = Array.from({ length: homeRowLimit }, (_, i) =>
      live({ id: `h${i}`, title: "T".repeat(150) }),
    );
    for (const message of [
      resultsMessage({ live: rows, moreLive: 300 }, { timeZone: null, now: NOW, productUrl }),
      resultsMessage({ live: [], moreLive: 0 }, { timeZone: null, now: NOW, productUrl }),
      helpMessage(),
      signInMessage(productUrl),
    ]) {
      expect(blockKitProblems("message", message.blocks ?? [], message.text)).toEqual([]);
      expect(message.response_type).toBe("ephemeral");
    }
  });

  it("says how many are live in one sentence each for one and many", () => {
    const reader = { timeZone: null, now: NOW, productUrl };
    expect(resultsMessage({ live: [live()], moreLive: 0 }, reader).text).toBe(
      "You have 1 live Holler.",
    );
    expect(resultsMessage({ live: [live()], moreLive: 1 }, reader).text).toBe(
      "You have 2 live hollers.",
    );
  });
});

describe("the Slack app manifest", () => {
  it("names the shortcut and the command the way the handlers expect", () => {
    expect(manifest.features.shortcuts.map((s) => s.callback_id)).toEqual([aboutMessageShortcutId]);
    expect(manifest.features.shortcuts[0]?.name.length).toBeLessThanOrEqual(24);
    expect(manifest.features.slash_commands[0]?.url).toMatch(/\/slack\/commands$/);
  });
});
