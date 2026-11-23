import type { HollerDraftInput } from "@holler/core";
import { and, eq } from "@holler/core/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCronPass } from "../cron";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import { closeHoller, sendHoller } from "./delivery";
import { workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";
import { overdueAfterMinutes, overdueWork } from "./overdue";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());
beforeEach(() => emptyDatabase(raw));

const NOW = new Date("2026-11-20T10:00:00Z");
const HOUR = 3600_000;
const at = (offset: number) => new Date(NOW.getTime() + offset);
const late = overdueAfterMinutes * 60_000;

const pulse = {
  mode: "pulse",
  questions: [
    { type: "single", prompt: "Good week?", options: [{ label: "Yes" }, { label: "No" }] },
  ],
  audience: { people: ["UA", "UB"], groups: [], everyone: false },
} satisfies HollerDraftInput;

async function sent(draft: Partial<HollerDraftInput> = {}) {
  const { ctx, workspaceId } = await workspaceFixture(db, NOW);
  const delivery = deliveryEnv(db, raw);
  const { id } = await createDraft(ctx, { ...pulse, ...draft });
  await sendHoller(ctx, delivery.env, id);
  return { ctx, workspaceId, id, ...delivery };
}

describe("overdueWork", () => {
  it("is empty while the cron and the consumer keep up", async () => {
    const { env, drain } = await sent();
    for (let hour = 0; hour <= 80; hour += 5) {
      await runCronPass(env, db, at(hour * HOUR));
      await drain(at(hour * HOUR));
      expect(await overdueWork(db, at(hour * HOUR))).toEqual([]);
    }
  });

  it("names a scheduled send the cron never made", async () => {
    await sent({ sendAt: at(HOUR).toISOString() });
    expect(await overdueWork(db, at(HOUR))).toEqual([]);
    expect(await overdueWork(db, at(HOUR + late))).toEqual(["send"]);
  });

  it("names an invite that was claimed and never posted", async () => {
    const { drain, queued } = await sent();
    queued.length = 0;
    await drain(NOW);
    expect(await overdueWork(db, at(late))).toEqual(["lost_invite"]);
  });

  it("names an invite nobody claimed", async () => {
    const { id } = await sent();
    await db
      .update(schema.recipients)
      .set({ invitedAt: null, sendAt: NOW })
      .where(eq(schema.recipients.hollerId, id));
    expect(await overdueWork(db, at(late))).toEqual(["invite"]);
  });

  it("names a reminder nobody sent, and forgets one whose person answered", async () => {
    const { id, drain } = await sent();
    await drain(NOW);
    const due = at(48 * HOUR);
    await db
      .update(schema.recipients)
      .set({ nextReminderAt: due })
      .where(eq(schema.recipients.hollerId, id));
    expect(await overdueWork(db, at(48 * HOUR + late))).toEqual(["reminder"]);
    await db
      .update(schema.recipients)
      .set({ answeredAt: due })
      .where(and(eq(schema.recipients.hollerId, id)));
    expect(await overdueWork(db, at(48 * HOUR + late))).toEqual([]);
  });

  it("names a close nobody made, and close work nobody queued", async () => {
    const { ctx, env, id, refuse, drain } = await sent();
    await drain(NOW);
    expect(await overdueWork(db, at(72 * HOUR + late))).toContain("close");
    refuse.add("close_notice");
    await closeHoller(ctx, env, id);
    expect(await overdueWork(db, at(late))).toEqual(["close_work"]);
  });

  it("names a close notice that was queued and never posted", async () => {
    const { ctx, env, id, drain, queued } = await sent();
    await drain(NOW);
    await closeHoller(ctx, env, id);
    queued.length = 0;
    expect(await overdueWork(db, at(late))).toEqual(["lost_close_notice"]);
    expect(await overdueWork(db, at(21 * HOUR))).toEqual([]);
  });

  it("names a first reminder that was claimed and never posted", async () => {
    const { env, drain, queued } = await sent();
    await drain(NOW);
    await runCronPass(env, db, at(25 * HOUR));
    expect(queued.map((send) => send.kind)).toContain("reminder");
    queued.length = 0;
    expect(await overdueWork(db, at(49 * HOUR))).toEqual(["lost_reminder"]);
  });

  it("leaves a workspace that removed Holler alone", async () => {
    const { workspaceId, queued } = await sent();
    queued.length = 0;
    await db
      .update(schema.workspaces)
      .set({ uninstalledAt: NOW })
      .where(eq(schema.workspaces.id, workspaceId));
    expect(await overdueWork(db, at(late))).toEqual([]);
  });
});
