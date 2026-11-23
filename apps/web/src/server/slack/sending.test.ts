import type { HollerDraftInput } from "@holler/core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import type { Db } from "../db";
import { sendHoller } from "../services/delivery";
import { workspaceFixture } from "../services/fixtures";
import { createDraft } from "../services/hollers";
import { markHomeOpened } from "../services/home-queue";
import { devSlack } from "../services/slack-connection";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import { blockKitProblems, viewProblems } from "./blocks/limits";
import { quickBlocks } from "./blocks/quick-pulse";
import { SlackApiError, type SlackView } from "./client";
import { sign } from "./verify";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());

const NOW = new Date("2026-11-20T10:00:00Z");
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await emptyDatabase(raw);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function setup() {
  const fixture = await workspaceFixture(db, NOW);
  const harness = deliveryEnv(db, raw);
  const slack = await devSlack(db, fixture.workspaceId);
  const teamId = `T${fixture.workspaceId}`;
  const pending: Promise<unknown>[] = [];
  const executionCtx = {
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext;

  async function request(path: string, body: string, contentType: string) {
    const timestamp = String(Math.floor(NOW.getTime() / 1000));
    const response = await app.request(
      path,
      {
        method: "POST",
        body,
        headers: {
          "content-type": contentType,
          "x-slack-request-timestamp": timestamp,
          "x-slack-signature": await sign("test-signing-secret", `v0:${timestamp}:${body}`),
        },
      },
      harness.env,
      executionCtx,
    );
    await Promise.all(pending.splice(0));
    await harness.drain(NOW);
    return response;
  }
  const command = (user: string, text: string, extra: Record<string, string> = {}) =>
    request(
      "/slack/commands",
      new URLSearchParams({
        command: "/holler",
        text,
        team_id: teamId,
        user_id: user,
        trigger_id: "trigger-1",
        ...extra,
      }).toString(),
      "application/x-www-form-urlencoded",
    );
  const interact = (payload: object) =>
    request(
      "/slack/interactions",
      new URLSearchParams({
        payload: JSON.stringify({ team: { id: teamId, domain: "northwind" }, ...payload }),
      }).toString(),
      "application/x-www-form-urlencoded",
    );
  const event = (event: object) =>
    request(
      "/slack/events",
      JSON.stringify({
        type: "event_callback",
        team_id: teamId,
        event_id: `Ev${crypto.randomUUID()}`,
        event,
      }),
      "application/json",
    );
  return { ...fixture, ...harness, slack, command, interact, event };
}

function filled(
  over: {
    prompt?: string;
    kind?: string;
    options?: string;
    people?: string[];
    channels?: string[];
  } = {},
) {
  return {
    [quickBlocks.prompt]: {
      value: { type: "plain_text_input", value: over.prompt ?? "Pizza or tacos?" },
    },
    [quickBlocks.kind]: {
      holler_quick_kind: {
        type: "static_select",
        selected_option: { value: over.kind ?? "options" },
      },
    },
    [quickBlocks.options]: {
      value: { type: "plain_text_input", value: over.options ?? "Pizza\nTacos" },
    },
    [quickBlocks.people]: {
      value: { type: "multi_users_select", selected_users: over.people ?? ["UA", "UB"] },
    },
    [quickBlocks.channels]: {
      value: { type: "multi_channels_select", selected_channels: over.channels ?? [] },
    },
    [quickBlocks.closes]: { value: { type: "static_select", selected_option: { value: "24" } } },
    [quickBlocks.anonymous]: { value: { type: "checkboxes", selected_options: [] } },
  };
}

const submit = (view: SlackView, values: object, viewId = "VQUICK1") => ({
  type: "view_submission",
  user: { id: "ULEAD" },
  view: {
    id: viewId,
    callback_id: view.callback_id,
    private_metadata: view.private_metadata,
    state: { values },
  },
});

const hollersOf = (workspaceId: string) =>
  db.query.hollers.findMany({ where: (row, { eq }) => eq(row.workspaceId, workspaceId) });

describe("/slack/commands", () => {
  it("refuses a request without a valid signature", async () => {
    const { env } = deliveryEnv(db, raw);
    const response = await app.request("/slack/commands", { method: "POST", body: "a=b" }, env);
    expect(response.status).toBe(401);
  });

  it("opens the quick pulse with the question typed after /holler", async () => {
    const { command, slack } = await setup();
    const response = await command("ULEAD", "How was your week?");
    expect(response.status).toBe(200);
    const view = slack.views[0]?.view;
    expect(JSON.stringify(view?.blocks)).toContain('"initial_value":"How was your week?"');
  });

  it("lists your live hollers with their counts, only to you", async () => {
    const { command, ctx, env, drain } = await setup();
    const draft = await createDraft(ctx, {
      mode: "pulse",
      title: "Offsite",
      questions: [{ type: "single", prompt: "Where?", options: [{ label: "A" }, { label: "B" }] }],
      audience: { people: ["UA", "UB"], groups: [], everyone: false },
    } satisfies HollerDraftInput);
    await sendHoller(ctx, env, draft.id);
    await drain(NOW);
    const response = await command("ULEAD", "results");
    const reply = (await response.json()) as {
      response_type: string;
      text: string;
      blocks: unknown[];
    };
    expect(reply.response_type).toBe("ephemeral");
    expect(reply.text).toBe("You have 1 live Holler.");
    expect(JSON.stringify(reply.blocks)).toContain("0 of 2 answered");
    expect(blockKitProblems("message", reply.blocks, reply.text)).toEqual([]);
  });

  it("asks someone who has not signed in to sign in, and opens nothing", async () => {
    const { command, slack } = await setup();
    const reply = (await (await command("UA", "")).json()) as { text: string };
    expect(reply.text).toMatch(/sign in to Holler once/);
    expect(slack.views).toEqual([]);
  });

  it("says what it does on /holler help, to anyone", async () => {
    const { command } = await setup();
    const reply = (await (await command("UA", "help")).json()) as { text: string };
    expect(reply.text).toContain("/holler results");
  });
});

describe("the quick pulse", () => {
  it("sends it after Slack's reply and shows how it went in the same modal", async () => {
    const { command, interact, slack, workspaceId } = await setup();
    await command("ULEAD", "");
    const opened = slack.views[0];
    if (!opened) throw new Error("no modal");
    const response = await interact(submit(opened.view, filled()));
    const reply = (await response.json()) as { response_action: string; view: SlackView };
    expect(reply.response_action).toBe("update");
    expect(viewProblems(reply.view)).toEqual([]);

    const [holler] = await hollersOf(workspaceId);
    expect(holler).toMatchObject({
      status: "live",
      mode: "pulse",
      createdVia: "slack",
      closeAfterHours: 24,
    });
    const recipients = await db.query.recipients.findMany({
      where: (row, { eq }) => eq(row.hollerId, holler?.id ?? ""),
    });
    expect(recipients.map((r) => r.slackUserId).sort()).toEqual(["UA", "UB"]);
    expect(slack.posted.map((m) => m.channel).sort()).toEqual(["UA", "UB"]);
    expect(slack.viewUpdates.map((u) => u.viewId)).toEqual(["VQUICK1"]);
    expect(JSON.stringify(slack.viewUpdates[0]?.view.blocks)).toContain("went to 2 people.");
  });

  it("makes one Holler and sends it once when Slack delivers the same submit twice", async () => {
    const { command, interact, slack, workspaceId } = await setup();
    await command("ULEAD", "");
    const view = slack.views[0]?.view;
    if (!view) throw new Error("no modal");
    await Promise.all([interact(submit(view, filled())), interact(submit(view, filled()))]);
    await interact(submit(view, filled()));
    expect(await hollersOf(workspaceId)).toHaveLength(1);
    expect(slack.posted.filter((m) => m.channel === "UA")).toHaveLength(1);
  });

  it("shows every problem beside its field and saves nothing", async () => {
    const { command, interact, slack, workspaceId } = await setup();
    await command("ULEAD", "");
    const view = slack.views[0]?.view;
    if (!view) throw new Error("no modal");
    const response = await interact(
      submit(view, filled({ prompt: "", options: "Same\nsame", people: [] })),
    );
    expect(await response.json()).toEqual({
      response_action: "errors",
      errors: {
        [quickBlocks.prompt]: "Write the question.",
        [quickBlocks.people]: "Choose people or a channel to send it to.",
      },
    });
    const duplicate = await interact(submit(view, filled({ options: "Same\nsame" })));
    expect(await duplicate.json()).toEqual({
      response_action: "errors",
      errors: {
        [quickBlocks.options]: "This option says the same as another. Change it or remove it.",
      },
    });
    expect(await hollersOf(workspaceId)).toEqual([]);
  });

  it("keeps the draft and says why when the monthly limit stops the send", async () => {
    const { command, interact, slack, workspaceId, ctx, env } = await setup();
    for (let i = 0; i < 5; i++) {
      const draft = await createDraft(ctx, {
        mode: "pulse",
        questions: [{ type: "text", prompt: `Q${i}` }],
        audience: { people: ["UA"], groups: [], everyone: false },
      });
      await sendHoller(ctx, env, draft.id);
    }
    await command("ULEAD", "");
    const view = slack.views[0]?.view;
    if (!view) throw new Error("no modal");
    await interact(submit(view, filled()));
    const shown = JSON.stringify(slack.viewUpdates.at(-1)?.view.blocks);
    expect(shown).toContain("Your pulse is saved as a draft.");
    const drafts = (await hollersOf(workspaceId)).filter((h) => h.status === "draft");
    expect(drafts).toHaveLength(1);
    expect(shown).toContain(`/hollers/${drafts[0]?.id}`);
  });

  it("ends on Not sent with the draft when Slack fails mid-send, never on Sending", async () => {
    const { command, interact, slack, workspaceId } = await setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    slack.failures.set("CBUSY", new SlackApiError("conversations.members", "ratelimited", 30));
    await command("ULEAD", "");
    const view = slack.views[0]?.view;
    if (!view) throw new Error("no modal");
    await interact(submit(view, filled({ people: [], channels: ["CBUSY"] })));
    const shown = slack.viewUpdates.at(-1);
    expect(shown?.viewId).toBe("VQUICK1");
    expect(JSON.stringify(shown?.view.blocks)).toContain("Your pulse is saved as a draft.");
    const [draft] = await hollersOf(workspaceId);
    expect(draft?.status).toBe("draft");
    expect(JSON.stringify(shown?.view.blocks)).toContain(`/hollers/${draft?.id}`);
  });

  it("redraws without the options box when the answers are a template", async () => {
    const { command, interact, slack } = await setup();
    await command("ULEAD", "");
    const view = slack.views[0];
    if (!view) throw new Error("no modal");
    await interact({
      type: "block_actions",
      user: { id: "ULEAD" },
      container: { type: "view", view_id: view.viewId },
      view: {
        id: view.viewId,
        callback_id: view.view.callback_id,
        private_metadata: view.view.private_metadata,
        state: { values: filled({ kind: "binary", prompt: "Ship it Friday?" }) },
      },
      actions: [{ action_id: "holler_quick_kind", block_id: quickBlocks.kind }],
    });
    const redrawn = slack.viewUpdates[0];
    expect(redrawn?.viewId).toBe(view.viewId);
    const ids = redrawn?.view.blocks.map((b) => (b as { block_id?: string }).block_id);
    expect(ids).not.toContain(quickBlocks.options);
    expect(JSON.stringify(redrawn?.view.blocks)).toContain('"initial_value":"Ship it Friday?"');
  });

  it("starts from a message with Send a Holler about this, linking it", async () => {
    const { interact, slack, workspaceId } = await setup();
    await interact({
      type: "message_action",
      callback_id: "holler_about_message",
      trigger_id: "trigger-2",
      user: { id: "ULEAD" },
      channel: { id: "C0GENERAL", name: "general" },
      message: { ts: "1700000000.000100", text: "Should we move standup?" },
    });
    const view = slack.views[0]?.view;
    if (!view) throw new Error("no modal");
    const url = "https://northwind.slack.com/archives/C0GENERAL/p1700000000000100";
    expect(JSON.stringify(view.blocks)).toContain(url);
    await interact(submit(view, filled()));
    const [holler] = await hollersOf(workspaceId);
    expect(holler?.description).toBe(`About [this message](${url}).`);
  });

  it("asks someone who has not signed in to sign in before they can send", async () => {
    const { interact, slack } = await setup();
    await interact({
      type: "message_action",
      callback_id: "holler_about_message",
      trigger_id: "trigger-3",
      user: { id: "UA" },
      channel: { id: "C0GENERAL" },
      message: { ts: "1700000000.000100" },
    });
    expect(JSON.stringify(slack.views[0]?.view.blocks)).toContain("Sign in to Holler");
  });
});

describe("App Home", () => {
  it("publishes a Home when it opens, and ignores the Messages tab", async () => {
    const { event, slack } = await setup();
    await event({ type: "app_home_opened", user: "UA", tab: "messages" });
    expect(slack.homes).toEqual([]);
    await event({ type: "app_home_opened", user: "UA", tab: "home" });
    expect(slack.homes.map((home) => home.userId)).toEqual(["UA"]);
    expect(viewProblems(slack.homes[0]?.view ?? { type: "home", blocks: [] })).toEqual([]);
  });

  it("opens the quick pulse from New holler", async () => {
    const { interact, slack } = await setup();
    await interact({
      type: "block_actions",
      user: { id: "ULEAD" },
      trigger_id: "trigger-4",
      container: { type: "view", view_id: "VHOME" },
      view: { id: "VHOME", type: "home" },
      actions: [{ action_id: "holler_home_new", value: "new" }],
    });
    expect(slack.views[0]?.view.callback_id).toBe("holler_quick_pulse");
  });

  it("sends a reminder from Send reminder and redraws the Home to say when the next can go", async () => {
    const { interact, slack, ctx, env, drain, workspaceId } = await setup();
    const draft = await createDraft(ctx, {
      mode: "pulse",
      title: "Offsite",
      questions: [{ type: "single", prompt: "Where?", options: [{ label: "A" }, { label: "B" }] }],
      audience: { people: ["UA", "UB"], groups: [], everyone: false },
    });
    await sendHoller(ctx, env, draft.id);
    await drain(NOW);
    await markHomeOpened(db, workspaceId, "ULEAD", NOW);
    const press = () =>
      interact({
        type: "block_actions",
        user: { id: "ULEAD" },
        container: { type: "view", view_id: "VHOME" },
        view: { id: "VHOME", type: "home" },
        actions: [{ action_id: "holler_home_remind", value: draft.id }],
      });
    await press();
    const reminders = () => slack.posted.filter((m) => m.text.startsWith("A reminder"));
    expect(reminders()).toHaveLength(2);
    const home = JSON.stringify(slack.homes.at(-1)?.view.blocks);
    expect(home).toContain("Reminded at 10:00. You can remind again at 14:00.");
    expect(home).not.toContain("holler_home_remind");

    await press();
    expect(reminders()).toHaveLength(2);
  });

  it("answers from the Home and drops the question from it at once", async () => {
    const { interact, slack, ctx, env, drain, workspaceId } = await setup();
    const draft = await createDraft(ctx, {
      mode: "survey",
      title: "Retro",
      questions: [{ type: "text", prompt: "What went well?" }],
      audience: { people: ["UA"], groups: [], everyone: false },
    });
    await sendHoller(ctx, env, draft.id);
    await drain(NOW);
    await markHomeOpened(db, workspaceId, "UA", NOW);
    await interact({
      type: "block_actions",
      user: { id: "UA" },
      trigger_id: "trigger-5",
      container: { type: "view", view_id: "VHOME" },
      view: { id: "VHOME", type: "home" },
      actions: [{ action_id: "holler_open", value: draft.id }],
    });
    const modal = slack.views[0]?.view;
    if (!modal) throw new Error("no answer modal");
    const question = draft.questions[0]?.id ?? "";
    await interact({
      type: "view_submission",
      user: { id: "UA" },
      view: {
        id: "VANSWER",
        callback_id: modal.callback_id,
        private_metadata: modal.private_metadata,
        state: {
          values: { [`q:${question}`]: { value: { type: "plain_text_input", value: "Pairing" } } },
        },
      },
    });
    expect(JSON.stringify(slack.homes.at(-1)?.view.blocks)).toContain("Nothing is waiting on you.");
    expect(slack.updated.some((m) => m.channel === "DA" && m.text.startsWith("Thanks."))).toBe(
      true,
    );
  });

  it("does nothing for Send reminder pressed by someone who did not write it", async () => {
    const { interact, slack, ctx, env, drain } = await setup();
    const draft = await createDraft(ctx, {
      mode: "pulse",
      questions: [{ type: "text", prompt: "Lunch?" }],
      audience: { people: ["UA"], groups: [], everyone: false },
    });
    await sendHoller(ctx, env, draft.id);
    await drain(NOW);
    await interact({
      type: "block_actions",
      user: { id: "UA" },
      container: { type: "view", view_id: "VHOME" },
      view: { id: "VHOME", type: "home" },
      actions: [{ action_id: "holler_home_remind", value: draft.id }],
    });
    expect(slack.posted.filter((m) => m.text.startsWith("A reminder"))).toEqual([]);
  });
});
