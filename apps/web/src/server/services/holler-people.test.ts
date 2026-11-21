import { and, eq } from "@holler/core/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { makeLive, workspaceFixture } from "./fixtures";
import { hollerPeople } from "./holler-people";
import { createDraft } from "./hollers";
import { recordResponse } from "./responses";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

async function answeredBy(anonymous: boolean, answering: string) {
  const { ctx, now } = await workspaceFixture(db);
  const holler = await createDraft(ctx, {
    mode: "pulse",
    title: "Lunch?",
    anonymous,
    questions: [{ type: "single", prompt: "Lunch?", options: [{ label: "Yes" }, { label: "No" }] }],
  });
  await makeLive(db, holler.id, ["UA", "UB", "UC"], now);
  const [question] = holler.questions;
  await recordResponse(ctx, {
    hollerId: holler.id,
    slackUserId: answering,
    via: "slack_button",
    response: {
      answers: [{ questionId: question?.id ?? "", optionIds: [question?.options[0]?.id ?? ""] }],
    },
  });
  return Object.assign(await hollerPeople(ctx, holler.id), { ctx, hollerId: holler.id, now });
}

describe("hollerPeople", () => {
  it("shows who answered a named Holler, answered first", async () => {
    const people = await answeredBy(false, "UC");
    expect(people).toMatchObject({ recipientCount: 3, answeredCount: 1, waitingCount: 2 });
    expect(people.recipients.map((r) => [r.slackUserId, r.answered])).toEqual([
      ["UC", true],
      ["UA", false],
      ["UB", false],
    ]);
  });

  it("shows how many answered an anonymous Holler, never who, in name order", async () => {
    const people = await answeredBy(true, "UC");
    expect(people).toMatchObject({ recipientCount: 3, answeredCount: 1, waitingCount: 2 });
    expect(people.recipients.map((r) => [r.slackUserId, r.answered])).toEqual([
      ["UA", null],
      ["UB", null],
      ["UC", null],
    ]);
  });

  it("says when Holler reminds next, from the earliest reminder still due", async () => {
    const { ctx, hollerId, now } = await answeredBy(false, "UC");
    const at = (hours: number) => new Date(now.getTime() + hours * 3600_000);
    const set = (slackUserId: string, values: Partial<typeof schema.recipients.$inferInsert>) =>
      db
        .update(schema.recipients)
        .set(values)
        .where(
          and(
            eq(schema.recipients.hollerId, hollerId),
            eq(schema.recipients.slackUserId, slackUserId),
          ),
        );
    await set("UA", { dmTs: "1.1", nextReminderAt: at(30) });
    await set("UB", { dmTs: "1.2", nextReminderAt: at(20), failure: "user_not_found" });
    // UC answered, so their stale reminder time does not count.
    await set("UC", { dmTs: "1.3", nextReminderAt: at(2) });
    const people = await hollerPeople(ctx, hollerId);
    expect(people.nextReminderAt).toBe(at(30).toISOString());
    expect(people.reminderAvailableAt).toBe(now.toISOString());
    expect(people.recipients.find((r) => r.slackUserId === "UB")?.unreachable).toBe(true);

    await db
      .update(schema.hollers)
      .set({ remindedAt: at(-1) })
      .where(eq(schema.hollers.id, hollerId));
    expect((await hollerPeople(ctx, hollerId)).reminderAvailableAt).toBe(at(3).toISOString());

    await db
      .update(schema.hollers)
      .set({ remindersEnabled: false })
      .where(eq(schema.hollers.id, hollerId));
    expect((await hollerPeople(ctx, hollerId)).nextReminderAt).toBeNull();
  });

  it("offers no reminder once nobody can be reminded or the Holler closed", async () => {
    const { ctx, hollerId } = await answeredBy(false, "UC");
    // Nobody has a DM yet, so nobody can be reminded.
    expect((await hollerPeople(ctx, hollerId)).reminderAvailableAt).toBeNull();
    await db
      .update(schema.recipients)
      .set({ dmTs: "1.1" })
      .where(eq(schema.recipients.hollerId, hollerId));
    expect((await hollerPeople(ctx, hollerId)).reminderAvailableAt).not.toBeNull();
    await db
      .update(schema.hollers)
      .set({ status: "closed" })
      .where(eq(schema.hollers.id, hollerId));
    const closed = await hollerPeople(ctx, hollerId);
    expect([closed.nextReminderAt, closed.reminderAvailableAt]).toEqual([null, null]);
  });
});
