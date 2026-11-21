import { eq } from "@holler/core/db";
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
    expect(where?.type === "single" && where.options.map((o) => [o.label, o.count])).toEqual([
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

/** A live survey with one question of each new kind, sent to UA–UF. */
async function extrasHoller(anonymous = false) {
  const fixture = await workspaceFixture(db);
  const holler = await createDraft(fixture.ctx, {
    mode: "survey",
    title: "Retro",
    anonymous,
    questions: [
      { type: "number", prompt: "Hours in meetings?", numberMin: 0, numberMax: 60 },
      { type: "person", prompt: "Who helped most?", maxChoices: 2 },
      {
        type: "multi",
        prompt: "What went well?",
        options: [{ label: "Planning" }, { label: "Pairing" }, { label: "Demos" }],
        allowOther: true,
        maxChoices: 2,
        followUp: { prompt: "Anything to add?", onlyAfter: [0, 3] },
      },
      {
        type: "single",
        prompt: "Same time next week?",
        options: [{ label: "Yes" }, { label: "No" }],
        required: false,
      },
    ],
  });
  await makeLive(db, holler.id, ["UA", "UB", "UC", "UD", "UE", "UF"], fixture.now);
  const [number, person, multi, single] = holler.questions;
  if (!number || !person || !multi || !single) throw new Error("fixture questions missing");
  const option = (label: string) => multi.options.find((o) => o.label === label)?.id ?? "";
  type Answer = NonNullable<Parameters<typeof recordResponse>[1]["response"]["answers"]>[number];
  const answer = (
    slackUserId: string,
    over: { number?: Answer; person?: Answer; multi?: Answer; single?: Answer } = {},
  ) =>
    recordResponse(fixture.ctx, {
      hollerId: holler.id,
      slackUserId,
      via: "slack_modal",
      response: {
        answers: [
          { questionId: number.id, number: 4, ...over.number },
          { questionId: person.id, slackUserIds: ["UB"], ...over.person },
          { questionId: multi.id, optionIds: [option("Pairing")], ...over.multi },
          { questionId: single.id, ...over.single },
        ],
      },
    });
  return { ...fixture, holler, number, person, multi, single, option, answer };
}

describe("new question types", () => {
  it("stores a number as its decimal string and keeps it in range", async () => {
    const { ctx, holler, number, answer } = await extrasHoller();
    await expect(
      answer("UA", { number: { questionId: number.id, number: 61 } }),
    ).rejects.toMatchObject({
      code: "invalid",
      field: number.id,
      message: "Enter a whole number from 0 to 60.",
    });
    await answer("UA", { number: { questionId: number.id, number: 12 } });
    await answer("UB", { number: { questionId: number.id, number: 3 } });
    const stored = await db
      .select({ text: schema.answers.text })
      .from(schema.answers)
      .where(eq(schema.answers.questionId, number.id));
    expect(stored.map((a) => a.text).sort()).toEqual(["12", "3"]);
    const results = await resultsFor(ctx, holler.id);
    if (results.state !== "open") throw new Error("expected open results");
    expect(results.questions[0]).toMatchObject({ type: "number", average: 7.5, min: 3, max: 12 });
  });

  it("takes people from this workspace, one row each, within the pick limit", async () => {
    const { ctx, holler, person, answer } = await extrasHoller();
    await expect(
      answer("UA", { person: { questionId: person.id, slackUserIds: ["UNOBODY"] } }),
    ).rejects.toMatchObject({
      field: person.id,
      message: "Pick someone from this Slack workspace.",
    });
    await expect(
      answer("UA", { person: { questionId: person.id, slackUserIds: ["UB", "UC", "UD"] } }),
    ).rejects.toMatchObject({ field: person.id, message: "Pick up to 2 people." });
    await answer("UA", { person: { questionId: person.id, slackUserIds: ["UB", "UC"] } });
    await answer("UD", { person: { questionId: person.id, slackUserIds: ["UB"] } });
    const results = await resultsFor(ctx, holler.id);
    if (results.state !== "open") throw new Error("expected open results");
    const picked = results.questions[1];
    expect(picked?.type === "person" && picked.people).toEqual([
      { slackUserId: "UB", name: "Person UB", count: 2, share: 1, pickedBy: ["UA", "UD"] },
      { slackUserId: "UC", name: "Person UC", count: 1, share: 0.5, pickedBy: ["UA"] },
    ]);
  });

  it("holds multiple choice to its pick limit", async () => {
    const { multi, option, answer } = await extrasHoller();
    await expect(
      answer("UA", {
        multi: {
          questionId: multi.id,
          optionIds: [option("Planning"), option("Pairing"), option("Demos")],
        },
      }),
    ).rejects.toMatchObject({ field: multi.id, message: "Pick up to 2 options." });
  });
});

describe("Other and follow-up notes", () => {
  it("takes Other's text only when Other is picked, and keeps it beside the answer", async () => {
    const { ctx, holler, multi, option, answer } = await extrasHoller();
    await expect(
      answer("UA", {
        multi: { questionId: multi.id, optionIds: [option("Demos")], otherText: "Lunch" },
      }),
    ).rejects.toMatchObject({ field: multi.id });
    await expect(
      answer("UA", { multi: { questionId: multi.id, optionIds: [option("Other")] } }),
    ).rejects.toMatchObject({ message: "Write your answer beside Other." });
    await answer("UA", {
      multi: { questionId: multi.id, optionIds: [option("Other")], otherText: "Team lunch" },
    });
    const results = await resultsFor(ctx, holler.id);
    if (results.state !== "open") throw new Error("expected open results");
    const went = results.questions[2];
    expect(went?.type === "multi" && went.otherTexts).toEqual([
      { text: "Team lunch", slackUserId: "UA" },
    ]);
    expect(went?.type === "multi" && went.options.at(-1)).toMatchObject({
      isOther: true,
      count: 1,
    });
  });

  it("takes a note only where the question asks for one", async () => {
    const { ctx, holler, multi, single, option, answer } = await extrasHoller();
    await expect(
      answer("UA", { single: { questionId: single.id, note: "Sure" } }),
    ).rejects.toMatchObject({
      field: single.id,
      message: "This question does not ask for a note.",
    });
    // The follow-up shows only after Planning (0) or Other (3).
    await expect(
      answer("UA", { multi: { questionId: multi.id, optionIds: [option("Demos")], note: "Fun" } }),
    ).rejects.toMatchObject({ field: multi.id });
    await answer("UA", {
      multi: { questionId: multi.id, optionIds: [option("Planning")], note: "Clear goals" },
    });
    const results = await resultsFor(ctx, holler.id);
    if (results.state !== "open") throw new Error("expected open results");
    const went = results.questions[2];
    expect(went?.type === "multi" && went.notes).toEqual([
      { text: "Clear goals", slackUserId: "UA" },
    ]);
  });

  it("keeps notes on an anonymous Holler free of names", async () => {
    const { ctx, holler, multi, option, answer } = await extrasHoller(true);
    for (const person of ["UA", "UB", "UC", "UD", "UE"]) {
      await answer(person, {
        multi: {
          questionId: multi.id,
          optionIds: [option("Planning")],
          note: `From ${person.length}`,
        },
      });
    }
    const results = await resultsFor(ctx, holler.id);
    if (results.state !== "open") throw new Error("expected open results");
    const went = results.questions[2];
    expect(went?.type === "multi" && went.notes.every((n) => n.slackUserId === null)).toBe(true);
  });
});
