import { plans } from "@holler/core";
import { eq } from "@holler/core/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { emptyDatabase } from "../test-delivery";
import { seedLeadHollers } from "./dev-seed";
import { workspaceFixture } from "./fixtures";
import { getHoller } from "./hollers";
import { monthlyUsage } from "./usage";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());
beforeEach(() => emptyDatabase(raw));

// The verify recipes and every local session drive the seed on whatever day it is, so the seed
// must leave the same things possible on every day of a month.
const days = [
  "2026-11-01T00:30:00Z",
  "2026-11-03T12:00:00Z",
  "2026-11-11T12:00:00Z",
  "2026-11-21T12:00:00Z",
  "2026-11-30T23:30:00Z",
  "2026-12-31T23:30:00Z",
  "2027-02-28T12:00:00Z",
  "2027-03-01T00:30:00Z",
];

function afterItsFirstLook(run: () => Promise<unknown>): Db {
  let looked = false;
  const hollers = {
    findFirst: async (query: Parameters<typeof db.query.hollers.findFirst>[0]) => {
      const found = await db.query.hollers.findFirst(query);
      if (!looked) {
        looked = true;
        await run();
      }
      return found;
    },
  };
  return new Proxy(db, {
    get(target, key) {
      if (key === "query") return { ...target.query, hollers };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("the dev seed", () => {
  it("lands once when another sign-in seeds between its look and its write", async () => {
    const now = new Date("2026-11-21T12:00:00Z");
    const { workspaceId, memberId } = await workspaceFixture(db, now);
    const seed = (on: Db) => seedLeadHollers(on, workspaceId, memberId, now);
    await seed(afterItsFirstLook(() => seed(db)));
    expect(await db.query.hollers.findMany()).toHaveLength(7);
  });

  for (const day of days) {
    it(`on ${day} leaves room to send, and its data works with Slack`, async () => {
      const now = new Date(day);
      const { ctx, workspaceId, memberId } = await workspaceFixture(db, now);
      await seedLeadHollers(db, workspaceId, memberId, now);

      const usage = await monthlyUsage(ctx);
      expect(plans.free.monthlyHollers - usage.sentThisMonth).toBeGreaterThanOrEqual(2);

      const hollers = await db.query.hollers.findMany({
        where: eq(schema.hollers.workspaceId, workspaceId),
      });
      for (const holler of hollers.filter((h) => h.status === "scheduled")) {
        // getHoller lists every reason an unsent Holler cannot go out, at the seed's own time.
        expect((await getHoller(ctx, holler.id)).problems, holler.title).toEqual([]);
      }
      for (const holler of hollers.filter((h) => h.status === "closed")) {
        expect(holler.closeQueuedAt, holler.title).toEqual(holler.closedAt);
      }
      const invited = await db.query.recipients.findMany();
      expect(invited.length).toBeGreaterThan(0);
      for (const recipient of invited) {
        expect(recipient.dmChannelId && recipient.dmTs, recipient.slackUserId).toBeTruthy();
      }
    });
  }
});
