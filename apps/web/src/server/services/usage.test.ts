import { plans } from "@holler/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { makeLive, workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";
import { closeDueHollers } from "./lifecycle";
import { assertCanSend, monthlyUsage } from "./usage";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

describe("monthly limit", () => {
  it("counts sent hollers this month and stops Free at its limit", async () => {
    const { ctx, now } = await workspaceFixture(db);
    for (let i = 0; i < plans.free.monthlyHollers; i++) {
      const draft = await createDraft(ctx, { mode: "pulse", title: `Pulse ${i}` });
      await makeLive(db, draft.id, ["UA"], now);
    }
    await createDraft(ctx, { mode: "pulse", title: "Still a draft" });
    expect(await monthlyUsage(ctx)).toEqual({
      plan: "free",
      sentThisMonth: plans.free.monthlyHollers,
    });
    await expect(assertCanSend(ctx)).rejects.toMatchObject({ code: "limit_reached" });
    await db.update(schema.workspaces).set({ plan: "team" });
    await expect(assertCanSend(ctx)).resolves.toBeUndefined();
  });
});

describe("closeDueHollers", () => {
  it("closes live hollers past their close time, once", async () => {
    const { ctx, now } = await workspaceFixture(db);
    const draft = await createDraft(ctx, { mode: "pulse", title: "Closing" });
    await makeLive(db, draft.id, ["UA"], now);
    const later = new Date(now.getTime() + 73 * 3600_000);
    expect(await closeDueHollers(db, later)).toContain(draft.id);
    expect(await closeDueHollers(db, later)).not.toContain(draft.id);
  });
});
