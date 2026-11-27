import type { HollerDraftInput } from "@holler/core";
import { eq } from "@holler/core/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import { sendDueHollers, sendHoller } from "./delivery";
import { workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";
import { changeRepeat, listRounds, nextRound, stopRepeating } from "./rounds";
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
const day = (n: number) => new Date(FIRST.getTime() + n * DAY);

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
        { label: "Good", score: 2 },
      ],
    },
  ],
  audience: { people: ["UA", "UB"], groups: [], everyone: false },
  sendAt: FIRST,
  repeat: "week",
  closeAfterHours: 48,
} satisfies HollerDraftInput;

async function sentOnce(draft: Partial<HollerDraftInput> = {}) {
  const fixture = await workspaceFixture(db, NOW);
  await devSlack(db, fixture.workspaceId);
  const { env } = deliveryEnv(db, raw);
  const first = await createDraft(fixture.ctx, { ...pulse, ...draft });
  await sendHoller(fixture.ctx, env, first.id);
  await sendDueHollers(env, db, FIRST);
  const at = (when: Date) => ({ ...fixture.ctx, now: () => when });
  return { ...fixture, env, first, at };
}

const rounds = (seriesId: string) =>
  db.query.hollers.findMany({
    where: (h, { eq, or }) => or(eq(h.id, seriesId), eq(h.repeatOfId, seriesId)),
    orderBy: (h, { asc }) => asc(h.sendAt),
  });

const shape = async (seriesId: string) =>
  (await rounds(seriesId)).map((h) => [h.status, h.sendAt?.toISOString(), h.repeatRule]);

const changes = () =>
  db.query.activity.findMany({ where: eq(schema.activity.action, "holler.repeat_changed") });

describe("changing how often a pulse repeats", () => {
  it("moves the next round to the new rule, on the first round's day and time", async () => {
    const { at, env, first } = await sentOnce();
    const next = (await rounds(first.id))[1];

    const out = await changeRepeat(at(day(1)), next?.id ?? "", "fortnight");
    expect(out).toMatchObject({ id: first.id, repeatRule: "fortnight" });
    expect(await shape(first.id)).toEqual([
      ["live", FIRST.toISOString(), "fortnight"],
      ["scheduled", day(14).toISOString(), "fortnight"],
    ]);
    expect((await listRounds(at(day(1)), first.id)).repeat).toBe("fortnight");
    expect((await changes()).map((a) => [a.subjectId, a.data])).toEqual([
      [first.id, { from: "week", to: "fortnight", sendAt: day(14).toISOString() }],
    ]);

    await sendDueHollers(env, db, day(14));
    expect((await shape(first.id)).at(-1)).toEqual([
      "scheduled",
      day(28).toISOString(),
      "fortnight",
    ]);
  });

  it("brings a fortnightly next round closer when it repeats every week", async () => {
    const { at, first } = await sentOnce({ repeat: "fortnight" });
    await changeRepeat(at(day(1)), first.id, "week");
    expect((await shape(first.id)).at(-1)).toEqual(["scheduled", day(7).toISOString(), "week"]);
  });

  it("records nothing when the rule is already the one chosen", async () => {
    const { at, first } = await sentOnce();
    await changeRepeat(at(day(1)), first.id, "week");
    expect(await changes()).toEqual([]);
    expect((await shape(first.id)).at(-1)).toEqual(["scheduled", day(7).toISOString(), "week"]);
  });

  it("is only for the person who wrote it, and only while it repeats", async () => {
    const { at, ctx, first } = await sentOnce();
    const stranger = {
      ...at(day(1)),
      actor: { via: "web" as const, memberId: "mem_other", slackUserId: "UB" },
    };
    await expect(changeRepeat(stranger, first.id, "fortnight")).rejects.toMatchObject({
      code: "not_found",
    });
    await stopRepeating(ctx, first.id);
    await expect(changeRepeat(at(day(1)), first.id, "fortnight")).rejects.toMatchObject({
      code: "invalid",
      field: "repeat",
    });
    expect(await changes()).toEqual([]);
  });

  it("refuses every week while each round stays open longer than a week", async () => {
    const { at, first } = await sentOnce({ repeat: "fortnight", closeAfterHours: 200 });
    await expect(changeRepeat(at(day(1)), first.id, "week")).rejects.toMatchObject({
      code: "invalid",
      field: "closeAfterHours",
    });
    const next = (await rounds(first.id))[1];
    await db
      .update(schema.hollers)
      .set({ closeAfterHours: 48 })
      .where(eq(schema.hollers.id, next?.id ?? ""));
    await expect(changeRepeat(at(day(1)), first.id, "week")).rejects.toMatchObject({
      code: "conflict",
    });
    expect((await shape(first.id)).map(([, , rule]) => rule)).toEqual(["fortnight", "fortnight"]);
  });

  it("schedules a round on the new rule when the change lands while it is being scheduled", async () => {
    const { at, first } = await sentOnce({ repeat: "fortnight" });
    const second = (await rounds(first.id))[1];
    await db
      .update(schema.hollers)
      .set({ status: "live" })
      .where(eq(schema.hollers.id, second?.id ?? ""));
    const round = await nextRound(at(day(14)), second?.id ?? "", null);
    if (!round) throw new Error("expected a next round");
    expect(round.sendAt).toEqual(day(28));
    await changeRepeat(at(day(14)), first.id, "week");
    await round.schedule();
    expect((await shape(first.id)).at(-1)).toEqual(["scheduled", day(21).toISOString(), "week"]);
  });

  it("changes nothing when a round goes out between its read and its write", async () => {
    const { at, env, first } = await sentOnce();
    const racing = new Proxy(db, {
      get(target, key, receiver) {
        if (key !== "batch") return Reflect.get(target, key, receiver);
        return async (...args: Parameters<Db["batch"]>) => {
          await sendDueHollers(env, db, day(7));
          return target.batch(...args);
        };
      },
    });
    await expect(
      changeRepeat({ ...at(day(6)), db: racing }, first.id, "fortnight"),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await shape(first.id)).toEqual([
      ["live", FIRST.toISOString(), "week"],
      ["live", day(7).toISOString(), "week"],
      ["scheduled", day(14).toISOString(), "week"],
    ]);
    expect(await changes()).toEqual([]);
  });
});
