import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
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
  return hollerPeople(ctx, holler.id);
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
});
