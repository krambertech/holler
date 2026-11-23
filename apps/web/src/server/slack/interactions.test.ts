import type { HollerDraftInput } from "@holler/core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import type { Db } from "../db";
import { remindWaiting, sendHoller } from "../services/delivery";
import { workspaceFixture } from "../services/fixtures";
import { createDraft } from "../services/hollers";
import { devSlack } from "../services/slack-connection";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import type { SlackView } from "./client";
import { sign } from "./verify";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());

/** Friday 20 November 2026, 10:00 UTC. The route reads the clock, so the clock is fixed. */
const NOW = new Date("2026-11-20T10:00:00Z");
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await emptyDatabase(raw);
});
afterEach(() => vi.useRealTimers());

interface Control {
  block_id?: string;
  action_id?: string;
  value?: string;
  text?: { text?: string };
  label?: { text?: string };
  elements?: Control[];
  element?: Control & { type: string; options?: Control[] };
}

const controlsOf = (message: { blocks?: unknown[] | undefined } | undefined) =>
  (message?.blocks ?? []) as Control[];

function inputLabelled(message: { blocks?: unknown[] | undefined } | undefined, label: string) {
  const block = controlsOf(message).find((b) => b.label?.text === label);
  if (!block?.block_id || !block.element) throw new Error(`no input labelled ${label}`);
  return { blockId: block.block_id, element: block.element };
}

async function live(draft: Partial<HollerDraftInput> = {}) {
  const fixture = await workspaceFixture(db, NOW);
  const harness = deliveryEnv(db, raw);
  const holler = await createDraft(fixture.ctx, {
    mode: "pulse",
    title: "Offsite",
    questions: [
      { type: "single", prompt: "Where?", options: [{ label: "Lisbon" }, { label: "Tallinn" }] },
    ],
    audience: { people: ["UA", "UB"], groups: [], everyone: false },
    ...draft,
  });
  await sendHoller(fixture.ctx, harness.env, holler.id);
  await harness.drain(NOW);
  const slack = await devSlack(db, fixture.workspaceId);
  const dmOf = (user: string) => {
    const dm = slack.posted.find((m) => m.channel === user);
    if (!dm) throw new Error(`no DM for ${user}`);
    return { channel_id: `D${user.slice(1)}`, message_ts: dm.ts };
  };
  const team = { id: `T${fixture.workspaceId}` };

  /** Posts a signed interaction, then runs what it queued. */
  async function post(payload: unknown) {
    const body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
    const timestamp = String(Math.floor(NOW.getTime() / 1000));
    const response = await app.request(
      "/slack/interactions",
      {
        method: "POST",
        body,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-slack-request-timestamp": timestamp,
          "x-slack-signature": await sign("test-signing-secret", `v0:${timestamp}:${body}`),
        },
      },
      harness.env,
    );
    await harness.drain(NOW);
    return response;
  }
  const send = (user: string, action: object, extra: object = {}) =>
    post({
      type: "block_actions",
      team,
      user: { id: user },
      container: dmOf(user),
      actions: [action],
      ...extra,
    });
  function press(user: string, label: string, extra: object = {}) {
    const button = slack.posted
      .filter((m) => m.channel === user)
      .flatMap((m) => controlsOf(m).flatMap((block) => block.elements ?? []))
      .find((element) => element.text?.text === label);
    if (!button) throw new Error(`no ${label} button in ${user}'s DM`);
    return send(user, { action_id: button.action_id, value: button.value }, extra);
  }
  function enter(user: string, message: { blocks?: unknown[] | undefined }, label: string) {
    const { blockId, element } = inputLabelled(message, label);
    return (value: string) =>
      send(user, { action_id: element.action_id, block_id: blockId, value });
  }
  async function openForm(user: string) {
    await press(user, "Answer", { trigger_id: `trigger-${user}` });
    const view = slack.views.at(-1)?.view;
    if (!view) throw new Error(`no form opened for ${user}`);
    return view;
  }
  function submit(user: string, view: SlackView, answers: Record<string, string>) {
    const values = Object.fromEntries(
      Object.entries(answers).map(([label, answer]) => {
        const { blockId, element } = inputLabelled(view, label);
        const option = element.options?.find((o) => o.text?.text === answer);
        const state = option
          ? { selected_option: { value: option.value } }
          : { value: answer || null };
        return [blockId, { [element.action_id ?? ""]: { type: element.type, ...state } }];
      }),
    );
    return post({
      type: "view_submission",
      team,
      user: { id: user },
      view: {
        callback_id: view.callback_id,
        private_metadata: view.private_metadata,
        state: { values },
      },
    });
  }
  return {
    ...fixture,
    ...harness,
    holler,
    slack,
    dmOf,
    team,
    post,
    send,
    press,
    enter,
    openForm,
    submit,
  };
}

const responsesOf = (hollerId: string) =>
  db.query.responses.findMany({ where: (row, { eq }) => eq(row.hollerId, hollerId) });

const survey = {
  mode: "survey",
  questions: [
    { type: "single", prompt: "Where?", options: [{ label: "Lisbon" }, { label: "Tallinn" }] },
    { type: "text", prompt: "Anything else?", required: false },
  ],
} satisfies Partial<HollerDraftInput>;

const chase = {
  mode: "chase",
  questions: [],
  externalUrl: "https://forms.example.com/benefits",
} satisfies Partial<HollerDraftInput>;

const freeText = {
  title: "",
  questions: [{ type: "text", prompt: "What should we stop doing?" }],
} satisfies Partial<HollerDraftInput>;

const withNote = {
  questions: [
    {
      type: "single",
      prompt: "Where?",
      options: [{ label: "Lisbon" }, { label: "Tallinn" }],
      followUp: { prompt: "Why there?", onlyAfter: null },
    },
  ],
} satisfies Partial<HollerDraftInput>;

const recipient = (hollerId: string, slackUserId: string) =>
  db.query.recipients.findFirst({
    where: (row, { and, eq }) => and(eq(row.hollerId, hollerId), eq(row.slackUserId, slackUserId)),
  });

describe("/slack/interactions", () => {
  it("refuses a request without a valid signature", async () => {
    const { env } = deliveryEnv(db, raw);
    const response = await app.request(
      "/slack/interactions",
      { method: "POST", body: "payload=%7B%7D" },
      env,
    );
    expect(response.status).toBe(401);
  });

  it("ignores a workspace Holler does not know", async () => {
    const { post, slack } = await live();
    const response = await post({
      type: "block_actions",
      team: { id: "TNOPE" },
      user: { id: "UA" },
    });
    expect(response.status).toBe(200);
    expect(slack.updated).toEqual([]);
  });

  it("records a one-tap answer and thanks the person in place", async () => {
    const { press, holler, slack, dmOf } = await live();
    expect((await press("UA", "Tallinn")).status).toBe(200);
    expect(await responsesOf(holler.id)).toHaveLength(1);
    expect(slack.updated.map((m) => [m.channel, m.ts, m.text])).toEqual([
      [dmOf("UA").channel_id, dmOf("UA").message_ts, "Thanks. Your answer to Offsite is in."],
    ]);
    expect(JSON.stringify(slack.updated[0]?.blocks)).toContain("Tallinn");
  });

  it("keeps the first answer when a person taps again", async () => {
    const { press, holler, slack } = await live();
    await press("UA", "Lisbon");
    await press("UA", "Tallinn");
    expect(await responsesOf(holler.id)).toHaveLength(1);
    expect(JSON.stringify(slack.updated.at(-1)?.blocks)).toContain("Lisbon");
  });

  it("answers a tap on a closed Holler with a polite line, not an error", async () => {
    const { press, holler, slack } = await live();
    await raw
      .prepare("update hollers set status = 'closed', closed_at = ? where id = ?")
      .bind(NOW.getTime(), holler.id)
      .run();
    expect((await press("UA", "Lisbon")).status).toBe(200);
    expect(await responsesOf(holler.id)).toHaveLength(0);
    expect(slack.updated[0]?.text).toBe("Offsite closed. It takes no more answers.");
  });

  it("opens the answer modal and records what it submits", async () => {
    const { openForm, submit, holler, slack } = await live(survey);
    const view = await openForm("UB");
    const submitted = await submit("UB", view, {
      "Where?": "Lisbon",
      "Anything else?": "Bring snacks",
    });
    expect(await submitted.json()).toEqual({ response_action: "clear" });
    expect(await responsesOf(holler.id)).toHaveLength(1);
    expect(JSON.stringify(slack.updated[0]?.blocks)).toContain("Lisbon");
    expect(JSON.stringify(slack.updated[0]?.blocks)).toContain("Bring snacks");
  });

  it("puts the error beside the question a modal left empty", async () => {
    const { openForm, submit, holler } = await live(survey);
    const view = await openForm("UA");
    const submitted = await submit("UA", view, { "Where?": "", "Anything else?": "" });
    expect(await submitted.json()).toEqual({
      response_action: "errors",
      errors: { [inputLabelled(view, "Where?").blockId]: "This question needs an answer." },
    });
    expect(await responsesOf(holler.id)).toEqual([]);
  });

  it("opens no modal for someone who already answered, and thanks them instead", async () => {
    const { press, openForm, submit, slack } = await live(survey);
    await submit("UA", await openForm("UA"), { "Where?": "Lisbon" });
    const before = { views: slack.views.length, updates: slack.updated.length };
    await press("UA", "Answer", { trigger_id: "trigger-2" });
    expect(slack.views).toHaveLength(before.views);
    expect(slack.updated.slice(before.updates).map((m) => m.text)).toEqual([
      "Thanks. Your answer to Offsite is in.",
    ]);
  });

  it("refuses to open a modal for someone the Holler was not sent to", async () => {
    const { post, holler, team, slack, openForm } = await live(survey);
    const response = await post({
      type: "block_actions",
      team,
      user: { id: "UC" },
      trigger_id: "trigger-3",
      actions: [{ action_id: "holler_open", value: holler.id }],
    });
    expect(response.status).toBe(403);
    expect(slack.views).toEqual([]);
    await openForm("UA");
    expect(slack.views).toHaveLength(1);
  });

  it("marks a form chase submitted", async () => {
    const { press, holler, slack } = await live(chase);
    await press("UB", "I submitted it");
    expect(await responsesOf(holler.id)).toHaveLength(1);
    expect(slack.updated[0]?.text).toBe("Thanks. You marked Offsite as submitted.");
  });

  it("does nothing for a link button", async () => {
    const { press, holler, slack } = await live(chase);
    expect((await press("UA", "Open the form")).status).toBe(200);
    expect(await responsesOf(holler.id)).toHaveLength(0);
    expect(slack.updated).toEqual([]);
  });

  it("takes a tap on a DM sent before this version of Holler", async () => {
    const pulse = await live();
    const [question] = pulse.holler.questions;
    await pulse.send("UA", {
      action_id: "holler_option_1",
      value: `${pulse.holler.id}|${question?.id}|${question?.options[1]?.id}`,
    });
    expect(JSON.stringify(pulse.slack.updated[0]?.blocks)).toContain("Tallinn");
    await remindWaiting(pulse.ctx, pulse.env, pulse.holler.id);
    await pulse.drain(NOW);
    await pulse.send("UB", { action_id: "holler_snooze", value: pulse.holler.id });
    expect((await recipient(pulse.holler.id, "UB"))?.snoozedUntil).toEqual(
      new Date("2026-11-20T15:00:00Z"),
    );

    const form = await live(survey);
    const open = { action_id: "holler_open", value: form.holler.id };
    await form.send("UA", open, { trigger_id: "trigger-1" });
    expect(form.slack.views).toHaveLength(1);

    const asked = await live(chase);
    await asked.send("UA", { action_id: "holler_done", value: asked.holler.id });
    expect(await responsesOf(asked.holler.id)).toHaveLength(1);

    const words = await live(freeText);
    await words.send("UA", {
      action_id: "holler_text",
      block_id: `text:${words.holler.id}:${words.holler.questions[0]?.id}`,
      value: "Long meetings",
    });
    expect(await responsesOf(words.holler.id)).toHaveLength(1);
  });

  it("snoozes a reminder and says when the next one comes", async () => {
    const { ctx, env, drain, press, holler, slack } = await live({ closeAfterHours: 7 * 24 });
    await remindWaiting(ctx, env, holler.id);
    await drain(NOW);
    const reminder = slack.posted.filter((m) => m.channel === "UA").at(-1);
    const container = { channel_id: "DA", message_ts: reminder?.ts };
    await press("UA", "Remind me later", { container });
    expect((await recipient(holler.id, "UA"))?.snoozedUntil).toEqual(
      new Date("2026-11-20T15:00:00Z"),
    );
    expect(slack.updated.map((m) => [m.channel, m.ts])).toEqual([["DA", reminder?.ts]]);
    expect(JSON.stringify(slack.updated[0]?.blocks)).toContain("I'll remind you again at 15:00.");
  });

  it("takes a free-text pulse's answer from the box in the DM", async () => {
    const { enter, holler, slack } = await live(freeText);
    const invite = slack.posted.find((m) => m.channel === "UA");
    const answer = enter("UA", invite ?? {}, "What should we stop doing?");
    await answer("   ");
    expect(await responsesOf(holler.id)).toHaveLength(0);
    await answer("Long meetings");
    expect(await responsesOf(holler.id)).toHaveLength(1);
    expect(JSON.stringify(slack.updated.at(-1)?.blocks)).toContain("Long meetings");
  });

  for (const anonymous of [false, true]) {
    it(`asks for the note after a tap, and keeps it${anonymous ? " on an anonymous Holler" : ""}`, async () => {
      const { press, enter, holler, slack } = await live({ ...withNote, anonymous });
      await press("UA", "Lisbon");
      await enter("UA", slack.updated.at(-1) ?? {}, "Why there?")("Cheap flights");
      const [response] = await responsesOf(holler.id);
      expect(response?.slackUserId).toBe(anonymous ? null : "UA");
      const notes = await db.query.answerNotes.findMany({
        where: (row, { eq }) => eq(row.responseId, response?.id ?? ""),
      });
      expect(notes.map((n) => [n.kind, n.text])).toEqual([["note", "Cheap flights"]]);
      const noted = await db.query.activity.findMany({
        where: (row, { eq }) => eq(row.action, "response.noted"),
      });
      // Activity says a note was added, never whose or what it says.
      expect(noted).toEqual([
        expect.objectContaining({ via: "slack", memberId: null, data: null }),
      ]);
      expect(controlsOf(slack.updated.at(-1)).some((block) => block.element)).toBe(false);
    });
  }

  it("refuses a note on someone else's named answer", async () => {
    const { press, post, team, slack } = await live(withNote);
    await press("UA", "Lisbon");
    const { blockId, element } = inputLabelled(slack.updated.at(-1), "Why there?");
    const response = await post({
      type: "block_actions",
      team,
      user: { id: "UB" },
      container: { channel_id: "DB", message_ts: "1.1" },
      actions: [{ action_id: element.action_id, block_id: blockId, value: "Not mine" }],
    });
    expect(response.status).toBe(403);
    expect(await db.query.answerNotes.findMany()).toEqual([]);
  });
});
