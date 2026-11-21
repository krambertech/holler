import { earliestInstantOf, type HollerDraftInput } from "@holler/core";
import { and, eq } from "@holler/core/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runBatch } from "../batch";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import { sendDueHollers, sendHoller } from "./delivery";
import { workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";
import { recordResponse } from "./responses";
import { listRounds, nextRound, roundColumns, stopRepeating } from "./rounds";
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
  it("closes every round before anyone gets the next, across clock changes and late sends", async () => {
    const cases = [
      {
        zone: "America/New_York",
        first: "2026-03-04T14:00:00Z",
        every: "week",
        perZone: false,
        lateHours: 0,
      },
      {
        zone: "America/New_York",
        first: "2026-03-04T14:00:00Z",
        every: "week",
        perZone: true,
        lateHours: 0,
      },
      {
        zone: "Pacific/Auckland",
        first: "2026-09-23T21:00:00Z",
        every: "week",
        perZone: true,
        lateHours: 0,
      },
      {
        zone: "Europe/London",
        first: "2026-10-21T07:00:00Z",
        every: "week",
        perZone: false,
        lateHours: 150,
      },
      {
        zone: "Australia/Sydney",
        first: "2026-04-01T22:00:00Z",
        every: "fortnight",
        perZone: true,
        lateHours: 0,
      },
      {
        zone: null,
        first: "2026-03-25T08:30:00Z",
        every: "fortnight",
        perZone: false,
        lateHours: 300,
      },
    ] as const;
    const overlaps: string[] = [];
    for (const { zone, first: firstIso, every, perZone, lateHours } of cases) {
      const firstAt = new Date(firstIso);
      await emptyDatabase(raw);
      const fixture = await workspaceFixture(db, new Date(firstAt.getTime() - 3 * DAY));
      await devSlack(db, fixture.workspaceId);
      const recipientZones = {
        ULEAD: zone,
        UA: "Pacific/Kiritimati",
        UB: "Pacific/Pago_Pago",
        UC: zone,
      };
      for (const [slackUserId, timeZone] of Object.entries(recipientZones)) {
        await db
          .update(schema.slackPeople)
          .set({ timeZone })
          .where(
            and(
              eq(schema.slackPeople.workspaceId, fixture.workspaceId),
              eq(schema.slackPeople.slackUserId, slackUserId),
            ),
          );
      }
      const { env } = deliveryEnv(db, raw);
      const first = await createDraft(fixture.ctx, {
        ...pulse,
        sendAt: firstAt,
        repeat: every,
        closeAfterHours: every === "week" ? 7 * 24 : 14 * 24,
        sendInRecipientTimeZone: perZone,
      });
      await sendHoller(fixture.ctx, env, first.id);
      const liveAt = (at: Date) => (perZone ? earliestInstantOf(at, zone) : at);
      await sendDueHollers(env, db, new Date(liveAt(firstAt).getTime() + lateHours * 3_600_000));
      const second = (await rounds(first.id))[1];
      if (!second?.sendAt) throw new Error("expected a second round");
      await sendDueHollers(env, db, liveAt(second.sendAt));
      const [sentFirst] = await rounds(first.id);
      const invites = await db.query.recipients.findMany({
        where: eq(schema.recipients.hollerId, second.id),
      });
      const nextInvite = Math.min(...invites.map((r) => r.sendAt?.getTime() ?? Infinity));
      const label = `${zone} ${firstAt.toISOString()} ${every} perZone=${perZone} late=${lateHours}h`;
      if (invites.length === 0) overlaps.push(`${label}: the second round never went out`);
      else if ((sentFirst?.closesAt?.getTime() ?? Infinity) > nextInvite) {
        overlaps.push(
          `${label}: closes ${sentFirst?.closesAt?.toISOString()}, next invite ${new Date(nextInvite).toISOString()}`,
        );
      }
    }
    expect(overlaps).toEqual([]);
  });

  it("schedules no round once Stop repeating wins the race against the send", async () => {
    const { ctx, first } = await series();
    const statements = (await nextRound({ ...ctx, now: () => FIRST }, first.id, null))?.statements;
    if (!statements) throw new Error("expected a next round");
    await stopRepeating(ctx, first.id);
    await runBatch(db, statements);
    expect((await rounds(first.id)).map((h) => [h.status, h.repeatRule])).toEqual([
      ["scheduled", null],
    ]);
    const scheduled = await db.query.activity.findMany({
      where: eq(schema.activity.action, "holler.scheduled"),
    });
    expect(scheduled.filter((a) => a.subjectId !== first.id)).toEqual([]);
  });

  it("removes a round scheduled while Stop repeating was on its way", async () => {
    const { ctx, first } = await series();
    const statements = (await nextRound({ ...ctx, now: () => FIRST }, first.id, null))?.statements;
    if (!statements) throw new Error("expected a next round");
    const racing = new Proxy(db, {
      get(target, key, receiver) {
        if (key !== "batch") return Reflect.get(target, key, receiver);
        return async (...args: Parameters<Db["batch"]>) => {
          await runBatch(target, statements);
          return target.batch(...args);
        };
      },
    });
    await stopRepeating({ ...ctx, db: racing }, first.id);
    expect((await rounds(first.id)).map((h) => [h.status, h.repeatRule])).toEqual([
      ["scheduled", null],
    ]);
  });
  it("lists every round newest first, with each one's average, from any round", async () => {
    const { ctx, env, first } = await series();
    await sendDueHollers(env, db, FIRST);
    const options = await db.query.options.findMany();
    const question = (await db.query.questions.findMany()).find((q) => q.hollerId === first.id);
    const answer = (slackUserId: string, label: string) =>
      recordResponse(
        { ...ctx, now: () => FIRST, actor: { via: "slack", recipientSlackUserId: slackUserId } },
        {
          hollerId: first.id,
          slackUserId,
          via: "slack_button",
          response: {
            answers: [
              {
                questionId: question?.id ?? "",
                optionIds: [
                  options.find((o) => o.questionId === question?.id && o.label === label)?.id ?? "",
                ],
              },
            ],
          },
        },
      );
    await answer("UA", "Good");
    await answer("UB", "Fine");
    const next = (await rounds(first.id))[1];
    const out = await listRounds(ctx, next?.id ?? "");
    expect(out.repeat).toBe("week");
    expect(out.rounds.map((r) => [r.id, r.status])).toEqual([
      [next?.id, "scheduled"],
      [first.id, "live"],
    ]);
    expect(out.rounds[1]).toMatchObject({
      recipientCount: 3,
      responseCount: 2,
      gated: false,
      scores: [{ position: 0, prompt: "How was your week?", average: 2.5, top: 3 }],
    });

    await stopRepeating(ctx, first.id);
    expect((await listRounds(ctx, first.id)).repeat).toBeNull();
    const stranger = {
      ...ctx,
      actor: { via: "web" as const, memberId: "mem_other", slackUserId: "UB" },
    };
    await expect(listRounds(stranger, first.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("shows an anonymous round's counts only, under five responses", async () => {
    const { ctx, env, first } = await series({ anonymous: true });
    await sendDueHollers(env, db, FIRST);
    const [round] = (await listRounds(ctx, first.id)).rounds.filter((r) => r.id === first.id);
    expect(round).toMatchObject({ gated: true, scores: [] });
  });
});
