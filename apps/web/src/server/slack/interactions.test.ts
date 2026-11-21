import type { HollerDraftInput } from "@holler/core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import type { Db } from "../db";
import { sendHoller } from "../services/delivery";
import { workspaceFixture } from "../services/fixtures";
import { createDraft } from "../services/hollers";
import { devSlack } from "../services/slack-connection";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import { actionIds, answerViewId } from "./blocks/format";
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
  const tap = (user: string, actionId: string, value: string, extra: object = {}) =>
    post({
      type: "block_actions",
      team,
      user: { id: user },
      container: dmOf(user),
      actions: [{ action_id: actionId, value }],
      ...extra,
    });
  const question = holler.questions[0];
  const pick = (index: number) =>
    `${holler.id}|${question?.id ?? ""}|${question?.options[index]?.id ?? ""}`;
  return { ...fixture, ...harness, holler, slack, dmOf, team, post, tap, pick };
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
    const { tap, pick, holler, slack, dmOf } = await live();
    expect((await tap("UA", `${actionIds.option}_1`, pick(1))).status).toBe(200);
    expect(await responsesOf(holler.id)).toHaveLength(1);
    expect(slack.updated.map((m) => [m.channel, m.ts, m.text])).toEqual([
      [dmOf("UA").channel_id, dmOf("UA").message_ts, "Thanks. Your answer to Offsite is in."],
    ]);
    expect(JSON.stringify(slack.updated[0]?.blocks)).toContain("Tallinn");
  });

  it("keeps the first answer when a person taps again", async () => {
    const { tap, pick, holler, slack } = await live();
    await tap("UA", `${actionIds.option}_0`, pick(0));
    await tap("UA", `${actionIds.option}_1`, pick(1));
    expect(await responsesOf(holler.id)).toHaveLength(1);
    expect(JSON.stringify(slack.updated.at(-1)?.blocks)).toContain("Lisbon");
  });

  it("answers a tap on a closed Holler with a polite line, not an error", async () => {
    const { tap, pick, holler, slack } = await live();
    await raw
      .prepare("update hollers set status = 'closed', closed_at = ? where id = ?")
      .bind(NOW.getTime(), holler.id)
      .run();
    expect((await tap("UA", `${actionIds.option}_0`, pick(0))).status).toBe(200);
    expect(await responsesOf(holler.id)).toHaveLength(0);
    expect(slack.updated[0]?.text).toBe("Offsite closed. It takes no more answers.");
  });

  it("opens the answer modal and records what it submits", async () => {
    const { tap, post, holler, slack, team } = await live(survey);
    await tap("UB", actionIds.open, holler.id, { trigger_id: "trigger-1" });
    const view = slack.views[0]?.view;
    expect(view?.callback_id).toBe(answerViewId);

    const [where, notes] = holler.questions;
    const submitted = await post({
      type: "view_submission",
      team,
      user: { id: "UB" },
      view: {
        callback_id: answerViewId,
        private_metadata: view?.private_metadata,
        state: {
          values: {
            [`q:${where?.id}`]: {
              value: { type: "radio_buttons", selected_option: { value: where?.options[0]?.id } },
            },
            [`q:${notes?.id}`]: { value: { type: "plain_text_input", value: "Bring snacks" } },
          },
        },
      },
    });
    expect(await submitted.json()).toEqual({ response_action: "clear" });
    expect(await responsesOf(holler.id)).toHaveLength(1);
    expect(JSON.stringify(slack.updated[0]?.blocks)).toContain("Bring snacks");
  });

  it("puts the error beside the question a modal left empty", async () => {
    const { post, holler, team } = await live(survey);
    const [where] = holler.questions;
    const submitted = await post({
      type: "view_submission",
      team,
      user: { id: "UA" },
      view: {
        callback_id: answerViewId,
        private_metadata: JSON.stringify({ hollerId: holler.id, channel: "", ts: "" }),
        state: { values: { [`q:${where?.id}`]: { value: { type: "radio_buttons" } } } },
      },
    });
    expect(await submitted.json()).toEqual({
      response_action: "errors",
      errors: { [`q:${where?.id}`]: "This question needs an answer." },
    });
  });

  it("opens no modal for someone who already answered, and thanks them instead", async () => {
    const { tap, post, holler, slack, team } = await live(survey);
    const [where] = holler.questions;
    await post({
      type: "view_submission",
      team,
      user: { id: "UA" },
      view: {
        callback_id: answerViewId,
        private_metadata: JSON.stringify({ hollerId: holler.id, channel: "", ts: "" }),
        state: {
          values: {
            [`q:${where?.id}`]: {
              value: { type: "radio_buttons", selected_option: { value: where?.options[0]?.id } },
            },
          },
        },
      },
    });
    const updatesBefore = slack.updated.length;
    await tap("UA", actionIds.open, holler.id, { trigger_id: "trigger-2" });
    expect(slack.views).toEqual([]);
    expect(slack.updated.slice(updatesBefore).map((m) => m.text)).toEqual([
      "Thanks. Your answer to Offsite is in.",
    ]);
  });

  it("refuses to open a modal for someone the Holler was not sent to", async () => {
    const { post, holler, team, slack } = await live();
    const response = await post({
      type: "block_actions",
      team,
      user: { id: "UC" },
      trigger_id: "trigger-3",
      actions: [{ action_id: actionIds.open, value: holler.id }],
    });
    expect(response.status).toBe(403);
    expect(slack.views).toEqual([]);
  });

  it("marks a form chase submitted", async () => {
    const { tap, holler, slack } = await live({
      mode: "chase",
      questions: [],
      externalUrl: "https://forms.example.com/benefits",
    });
    await tap("UB", actionIds.done, holler.id);
    expect(await responsesOf(holler.id)).toHaveLength(1);
    expect(slack.updated[0]?.text).toBe("Thanks. You marked Offsite as submitted.");
  });

  it("does nothing for a link button", async () => {
    const { tap, holler, slack } = await live();
    expect((await tap("UA", actionIds.formLink, holler.id)).status).toBe(200);
    expect(await responsesOf(holler.id)).toHaveLength(0);
    expect(slack.updated).toEqual([]);
  });

  it("snoozes a reminder and says when the next one comes", async () => {
    const { post, holler, slack, team } = await live({ closeAfterHours: 7 * 24 });
    const reminder = { channel_id: "DA", message_ts: "1700000099.000100" };
    await raw
      .prepare(
        "update recipients set reminders_sent = 1 where holler_id = ? and slack_user_id = 'UA'",
      )
      .bind(holler.id)
      .run();
    await post({
      type: "block_actions",
      team,
      user: { id: "UA" },
      container: reminder,
      actions: [{ action_id: actionIds.snooze, value: holler.id }],
    });
    const recipient = await db.query.recipients.findFirst({
      where: (row, { and, eq }) => and(eq(row.hollerId, holler.id), eq(row.slackUserId, "UA")),
    });
    // 10:00 UTC is before 15:00, so 15:00 today.
    expect(recipient?.snoozedUntil).toEqual(new Date("2026-11-20T15:00:00Z"));
    expect(slack.updated.map((m) => [m.channel, m.ts])).toEqual([["DA", reminder.message_ts]]);
    expect(JSON.stringify(slack.updated[0]?.blocks)).toContain("I'll remind you again at 15:00.");
  });
});
