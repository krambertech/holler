import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { makeLive, workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";
import { recordResponse, resultsFor } from "./responses";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

async function liveHoller(anonymous = false, recipients = ["UA", "UB", "UC", "UD", "UE", "UF"]) {
  const fixture = await workspaceFixture(db);
  const holler = await createDraft(fixture.ctx, {
    mode: "survey",
    title: "Offsite",
    anonymous,
    questions: [
      { type: "single", prompt: "Where?", options: [{ label: "Lisbon" }, { label: "Tallinn" }] },
      { type: "text", prompt: "Anything else?", required: false },
    ],
  });
  await makeLive(db, holler.id, recipients, fixture.now);
  const [where, notes] = holler.questions;
  if (!where || !notes) throw new Error("fixture questions missing");
  const answer = (slackUserId: string, optionIndex: number, text: string | null = null) =>
    recordResponse(fixture.ctx, {
      hollerId: holler.id,
      slackUserId,
      via: "slack_modal",
      response: {
        answers: [
          { questionId: where.id, optionIds: [where.options[optionIndex]?.id ?? ""] },
          { questionId: notes.id, text },
        ],
      },
    });
  return { ...fixture, holler, where, notes, answer };
}

describe("recordResponse", () => {
  it("records answers and marks the recipient answered", async () => {
    const { ctx, holler, answer } = await liveHoller();
    await answer("UA", 1, "Bring coats");
    const results = await resultsFor(ctx, holler.id);
    if (results.state !== "open") throw new Error("expected open results");
    const [where, notes] = results.questions;
    expect(where?.type !== "text" && where?.options.map((o) => [o.label, o.count])).toEqual([
      ["Lisbon", 0],
      ["Tallinn", 1],
    ]);
    expect(notes?.type === "text" && notes.texts).toEqual([
      { text: "Bring coats", slackUserId: "UA" },
    ]);
  });

  it("takes one response per person", async () => {
    const { answer } = await liveHoller();
    await answer("UA", 0);
    await expect(answer("UA", 1)).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses someone the Holler was not sent to", async () => {
    const { answer } = await liveHoller();
    await expect(answer("UZ", 0)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses an option from another question", async () => {
    const { ctx, holler, where, notes } = await liveHoller();
    const other = await liveHoller();
    await expect(
      recordResponse(ctx, {
        hollerId: holler.id,
        slackUserId: "UA",
        via: "web",
        response: {
          answers: [
            { questionId: where.id, optionIds: [other.where.options[0]?.id ?? ""] },
            { questionId: notes.id, text: null },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "invalid", field: where.id });
  });

  it("refuses an answer once the Holler is closed", async () => {
    const { holler, answer } = await liveHoller();
    await db.update(schema.hollers).set({ status: "closed" });
    void holler;
    await expect(answer("UB", 0)).rejects.toMatchObject({ code: "closed" });
  });
});

describe("anonymous hollers", () => {
  it("stores no person and gates results under five responses", async () => {
    const { ctx, holler, answer } = await liveHoller(true);
    for (const [i, person] of ["UA", "UB", "UC", "UD"].entries())
      await answer(person, i % 2, "note");
    expect(await resultsFor(ctx, holler.id)).toEqual({
      state: "gated",
      responseCount: 4,
      needed: 1,
    });
    const rows = await db.select().from(schema.responses);
    expect(rows.filter((r) => r.hollerId === holler.id).every((r) => r.slackUserId === null)).toBe(
      true,
    );
    await answer("UE", 0);
    const open = await resultsFor(ctx, holler.id);
    expect(open.state).toBe("open");
    expect(JSON.stringify(open)).not.toMatch(/"U[A-F]"/);
  });
});
