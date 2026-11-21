import { plans } from "@holler/core";
import { eq } from "@holler/core/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { emptyDatabase } from "../test-delivery";
import { seedLeadHollers } from "./dev-seed";
import { workspaceFixture } from "./fixtures";
import { sendProblems } from "./hollers";
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

describe("the dev seed", () => {
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
        const questions = await db.query.questions.findMany({
          where: eq(schema.questions.hollerId, holler.id),
        });
        expect(sendProblems({ ...holler, questions }), holler.title).toEqual([]);
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
