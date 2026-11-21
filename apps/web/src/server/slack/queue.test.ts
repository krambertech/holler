import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db";
import { type SlackSend, sendHoller } from "../services/delivery";
import { workspaceFixture } from "../services/fixtures";
import { createDraft } from "../services/hollers";
import { devSlack } from "../services/slack-connection";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import { SlackApiError } from "./client";
import { backoffSeconds, consumeSlackSends } from "./queue";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());
beforeEach(() => emptyDatabase(raw));

const NOW = new Date("2026-11-20T10:00:00Z");

function batchOf(sends: SlackSend[], attempts = 1) {
  const messages = sends.map((body, index) => ({
    id: `m${index}`,
    timestamp: NOW,
    attempts,
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  }));
  return {
    batch: { queue: "holler-slack-sends", messages } as unknown as MessageBatch<SlackSend>,
    messages,
  };
}

async function invites() {
  const { ctx, workspaceId } = await workspaceFixture(db, NOW);
  const harness = deliveryEnv(db, raw);
  const holler = await createDraft(ctx, {
    mode: "pulse",
    title: "Lunch?",
    questions: [{ type: "single", prompt: "Lunch?", options: [{ label: "Yes" }, { label: "No" }] }],
    audience: { people: ["UA", "UB", "UC"], groups: [], everyone: false },
  });
  await sendHoller(ctx, harness.env, holler.id);
  return { ...harness, slack: await devSlack(db, workspaceId) };
}

describe("consumeSlackSends", () => {
  it("acks each message that went out, and retries each that did not, on its own", async () => {
    const { env, queued, slack } = await invites();
    slack.failures.set("UB", new SlackApiError("chat.postMessage", "ratelimited", 42));
    slack.failures.set("UC", new SlackApiError("chat.postMessage", "internal_error"));
    const { batch, messages } = batchOf(queued, 3);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await consumeSlackSends(batch, env);
    const [ua, ub, uc] = messages;
    expect(ua?.ack).toHaveBeenCalledOnce();
    expect(ua?.retry).not.toHaveBeenCalled();
    // A rate limit waits as long as Slack asked.
    expect(ub?.retry).toHaveBeenCalledWith({ delaySeconds: 42 });
    // Anything else backs off by attempt: the third waits 40 seconds.
    expect(uc?.retry).toHaveBeenCalledWith({ delaySeconds: 40 });
    expect(slack.posted.map((m) => m.channel)).toEqual(["UA"]);
  });

  it("acks a permanent failure, which is stored instead of retried", async () => {
    const { env, queued, slack } = await invites();
    slack.failures.set("UA", new SlackApiError("chat.postMessage", "user_not_found"));
    const { batch, messages } = batchOf(
      queued.filter((s) => "slackUserId" in s && s.slackUserId === "UA"),
    );
    await consumeSlackSends(batch, env);
    expect(messages[0]?.ack).toHaveBeenCalledOnce();
  });
});

describe("backoffSeconds", () => {
  it("doubles from 10 seconds and stops at ten minutes", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(backoffSeconds)).toEqual([
      10, 20, 40, 80, 160, 320, 600, 600,
    ]);
  });
});
