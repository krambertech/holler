import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCronPass, runSteps } from "./cron";
import type { Db } from "./db";
import { sendHoller } from "./services/delivery";
import { workspaceFixture } from "./services/fixtures";
import { createDraft } from "./services/hollers";
import { testDb } from "./test-db";
import { deliveryEnv, emptyDatabase } from "./test-delivery";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());
beforeEach(() => emptyDatabase(raw));

const NOW = new Date("2026-11-20T10:00:00Z");
const HOUR = 3600_000;

describe("runSteps", () => {
  it("runs every step when one fails, then names each failure", async () => {
    const ran: string[] = [];
    const steps = runSteps({
      first: async () => ran.push("first"),
      broken: async () => {
        throw new Error("Slack is down");
      },
      after: async () => ran.push("after"),
      alsoBroken: async () => {
        throw new Error("D1 is down");
      },
    });
    await expect(steps).rejects.toThrow("Cron steps failed: broken, alsoBroken");
    await expect(steps).rejects.toMatchObject({
      errors: [new Error("Slack is down"), new Error("D1 is down")],
    });
    expect(ran.sort()).toEqual(["after", "first"]);
  });

  it("finishes the first step before the others start", async () => {
    const order: string[] = [];
    await runSteps({
      first: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push("first");
      },
      second: async () => order.push("second"),
    });
    expect(order).toEqual(["first", "second"]);
  });
});

describe("runCronPass", () => {
  it("still queues the close notices when the reminder step fails", async () => {
    const { ctx } = await workspaceFixture(db, NOW);
    const { env, queued, refuse, drain } = deliveryEnv(db, raw);
    const draft = (title: string, closeAfterHours: number) =>
      createDraft(ctx, {
        mode: "pulse",
        title,
        questions: [
          { type: "single", prompt: title, options: [{ label: "Yes" }, { label: "No" }] },
        ],
        audience: { people: ["UA"], groups: [], everyone: false },
        closeAfterHours,
      });
    const closing = await draft("Lunch?", 1);
    const waiting = await draft("Offsite?", 7 * 24);
    await sendHoller(ctx, env, closing.id);
    await sendHoller(ctx, env, waiting.id);
    await drain(NOW);

    // A day later the first has closed and the second owes UA a reminder, which the queue refuses.
    refuse.add("reminder");
    const dayIn = new Date(NOW.getTime() + 24 * HOUR);
    await expect(runCronPass(env, db, dayIn)).rejects.toThrow("Cron steps failed: reminded");
    expect(queued).toContainEqual({ kind: "close_notice", hollerId: closing.id });
  });
});
