import type { HollerDraftInput } from "@holler/core";
import { eq } from "@holler/core/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import { sendDueHollers, sendHoller } from "./delivery";
import { workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";
import { recordResponse } from "./responses";
import { roundColumns, stopRepeating } from "./rounds";
import { devSlack } from "./slack-connection";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());
beforeEach(() => emptyDatabase(raw));

const NOW = new Date("2026-11-20T10:00:00Z");
const FIRST = new Date("2026-11-23T09:00:00Z");
const DAY = 86_400_000;

const pulse = {
  mode: "pulse",
  title: "How was your week?",
  questions: [
    {
      type: "single",
      style: "scale",
      prompt: "How was your week?",
      options: [
        { label: "Rough", score: 1 },
        { label: "Fine", score: 2 },
        { label: "Good", score: 3 },
      ],
    },
  ],
  audience: { people: ["UA", "UB", "UC"], groups: [], everyone: false },
  sendAt: FIRST,
  repeat: "week",
  closeAfterHours: 48,
} satisfies HollerDraftInput;

async function series(draft: Partial<HollerDraftInput> = {}) {
  const fixture = await workspaceFixture(db, NOW);
  await devSlack(db, fixture.workspaceId);
  const harness = deliveryEnv(db, raw);
  const first = await createDraft(fixture.ctx, { ...pulse, ...draft });
  await sendHoller(fixture.ctx, harness.env, first.id);
  return { ...fixture, ...harness, first };
}

const rounds = (seriesId: string) =>
  db.query.hollers.findMany({
    where: (h, { eq, or }) => or(eq(h.id, seriesId), eq(h.repeatOfId, seriesId)),
    orderBy: (h, { asc }) => asc(h.sendAt),
  });

const promptsOf = async (hollerId: string) => {
  const qs = await db.query.questions.findMany({ where: eq(schema.questions.hollerId, hollerId) });
  const opts = await db.query.options.findMany();
  return qs.map((q) => ({
    prompt: q.prompt,
    style: q.style,
    options: opts
      .filter((o) => o.questionId === q.id)
      .sort((a, b) => a.position - b.position)
      .map((o) => [o.label, o.score]),
  }));
};

describe("repeating pulses", () => {
  it("schedules the next round, a week on, when a round goes out", async () => {
    const { env, first } = await series();
    expect((await rounds(first.id)).map((h) => h.status)).toEqual(["scheduled"]);

    expect(await sendDueHollers(env, db, FIRST)).toEqual([first.id]);
    const [sent, next] = await rounds(first.id);
    expect(sent).toMatchObject({ id: first.id, status: "live" });
    expect(next).toMatchObject({
      status: "scheduled",
      sendAt: new Date(FIRST.getTime() + 7 * DAY),
      repeatOfId: first.id,
      repeatRule: "week",
      sentAt: null,
      closesAt: null,
      reportToken: null,
    });
    expect(await promptsOf(next?.id ?? "")).toEqual(await promptsOf(first.id));
  });

  it("keeps every round on the first round's day and time, and in one series", async () => {
    const { env, first } = await series({ repeat: "fortnight" });
    let at = FIRST;
    for (let round = 1; round <= 4; round++) {
      await sendDueHollers(env, db, at);
      at = new Date(FIRST.getTime() + round * 14 * DAY);
    }
    const all = await rounds(first.id);
    expect(all.map((h) => h.sendAt?.toISOString())).toEqual(
      [0, 1, 2, 3, 4].map((n) => new Date(FIRST.getTime() + n * 14 * DAY).toISOString()),
    );
    expect(all.map((h) => h.status)).toEqual(["live", "live", "live", "live", "scheduled"]);
    expect(new Set(all.slice(1).map((h) => h.repeatOfId))).toEqual(new Set([first.id]));
  });

  it("schedules one next round when the cron runs the same send at once", async () => {
    const { env, first } = await series();
    await Promise.allSettled(Array.from({ length: 5 }, () => sendDueHollers(env, db, FIRST)));
    expect((await rounds(first.id)).map((h) => h.status)).toEqual(["live", "scheduled"]);
  });

  it("never schedules a round in the past when a send runs late", async () => {
    const { env, first } = await series();
    const late = new Date(FIRST.getTime() + 9 * DAY);
    await sendDueHollers(env, db, late);
    const next = (await rounds(first.id))[1];
    expect(next?.sendAt).toEqual(new Date(FIRST.getTime() + 14 * DAY));
  });

  it("copies every column to the next round except the ones each round has for itself", async () => {
    const { env, first } = await series({ tags: ["team"], anonymous: true });
    await sendDueHollers(env, db, FIRST);
    const [source, next] = await rounds(first.id);
    if (!source || !next) throw new Error("expected two rounds");
    for (const [column, kind] of Object.entries(roundColumns)) {
      if (kind !== "copy") continue;
      const key = column as keyof typeof source;
      expect(next[key], column).toEqual(source[key]);
    }
  });

  it("stops repeating: the next round goes, the answers stay", async () => {
    const { ctx, env, first } = await series();
    await sendDueHollers(env, db, FIRST);
    const option = (await db.query.options.findMany()).find((o) => o.label === "Good");
    const question = (await db.query.questions.findMany()).find((q) => q.hollerId === first.id);
    await recordResponse(
      { ...ctx, now: () => FIRST, actor: { via: "slack", recipientSlackUserId: "UA" } },
      {
        hollerId: first.id,
        slackUserId: "UA",
        via: "slack_button",
        response: { answers: [{ questionId: question?.id ?? "", optionIds: [option?.id ?? ""] }] },
      },
    );

    const stranger = {
      ...ctx,
      actor: { via: "web" as const, memberId: "mem_other", slackUserId: "UB" },
    };
    await expect(stopRepeating(stranger, first.id)).rejects.toMatchObject({ code: "not_found" });

    const next = (await rounds(first.id))[1];
    const out = await stopRepeating(ctx, next?.id ?? "");
    expect(out).toMatchObject({ id: first.id, repeatRule: null });
    expect((await rounds(first.id)).map((h) => [h.status, h.repeatRule])).toEqual([["live", null]]);
    expect(await db.query.responses.findMany()).toHaveLength(1);
    const activity = await db.query.activity.findMany();
    expect(activity.map((a) => a.action)).toContain("holler.repeat_stopped");
  });
});
