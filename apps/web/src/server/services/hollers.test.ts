import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { testDb } from "../test-db";
import { ServiceError } from "./context";
import { makeLive, workspaceFixture } from "./fixtures";
import {
  createDraft,
  getHoller,
  homeCounts,
  listHollers,
  sendProblems,
  updateDraft,
} from "./hollers";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

const pulse = {
  mode: "pulse" as const,
  title: "How was your week?",
  tags: ["Weekly"],
  questions: [
    {
      type: "single" as const,
      style: "scale" as const,
      prompt: "How was it?",
      options: [
        { label: "Rough", score: 1 },
        { label: "Great", score: 2 },
      ],
    },
  ],
};

describe("drafts", () => {
  it("creates a draft with its questions and options in order", async () => {
    const { ctx } = await workspaceFixture(db);
    const holler = await createDraft(ctx, pulse);
    expect(holler.status).toBe("draft");
    expect(holler.tags).toEqual(["weekly"]);
    expect(holler.questions).toHaveLength(1);
    expect(holler.questions[0]?.options.map((o) => o.label)).toEqual(["Rough", "Great"]);
  });

  it("replaces questions on update and keeps the mode", async () => {
    const { ctx } = await workspaceFixture(db);
    const holler = await createDraft(ctx, pulse);
    const updated = await updateDraft(ctx, holler.id, {
      ...pulse,
      questions: [{ type: "text", prompt: "Why?" }],
    });
    expect(updated.questions.map((q) => q.prompt)).toEqual(["Why?"]);
    await expect(updateDraft(ctx, holler.id, { ...pulse, mode: "survey" })).rejects.toMatchObject({
      field: "mode",
    });
  });

  it("refuses to change a live Holler's questions", async () => {
    const { ctx, now } = await workspaceFixture(db);
    const holler = await createDraft(ctx, pulse);
    await makeLive(db, holler.id, ["UA"], now);
    await expect(updateDraft(ctx, holler.id, pulse)).rejects.toMatchObject({ code: "conflict" });
  });

  it("keeps another workspace's hollers out of reach", async () => {
    const a = await workspaceFixture(db);
    const b = await workspaceFixture(db);
    const holler = await createDraft(a.ctx, pulse);
    await expect(getHoller(b.ctx, holler.id)).rejects.toBeInstanceOf(ServiceError);
    expect(await listHollers(b.ctx, { scope: "mine" })).toEqual([]);
  });
});

describe("home", () => {
  it("counts live, waiting and scheduled", async () => {
    const { ctx, now } = await workspaceFixture(db);
    const live = await createDraft(ctx, pulse);
    await makeLive(db, live.id, ["UA", "UB", "UC"], now);
    await createDraft(ctx, { ...pulse, sendAt: new Date(now.getTime() + 3600_000) });
    expect(await homeCounts(ctx)).toEqual({ live: 1, waiting: 3, scheduled: 0 });
  });

  it("lists with counts, filters by tag and finds by title", async () => {
    const { ctx, now } = await workspaceFixture(db);
    const live = await createDraft(ctx, pulse);
    await makeLive(db, live.id, ["UA", "UB"], now);
    await createDraft(ctx, { mode: "survey", title: "Offsite dates" });
    const all = await listHollers(ctx, { scope: "mine" });
    expect(all).toHaveLength(2);
    const row = all.find((h) => h.id === live.id);
    expect(row).toMatchObject({ recipientCount: 2, answeredCount: 0, questionCount: 1 });
    expect(row?.people.map((p) => p.name)).toEqual(["Person UA", "Person UB"]);
    expect((await listHollers(ctx, { scope: "mine", tag: "WEEKLY" })).map((h) => h.id)).toEqual([
      live.id,
    ]);
    expect((await listHollers(ctx, { scope: "mine", q: "offsite" })).map((h) => h.title)).toEqual([
      "Offsite dates",
    ]);
  });
});

describe("sendProblems", () => {
  it("names every missing piece at once", () => {
    const problems = sendProblems({
      mode: "chase",
      title: " ",
      externalUrl: null,
      audience: { people: [], groups: [], everyone: false },
      questions: [],
    });
    expect(problems.map((p) => p.field)).toEqual(["title", "externalUrl", "audience"]);
  });

  it("caps a pulse at two questions", () => {
    const problems = sendProblems({
      mode: "pulse",
      title: "x",
      externalUrl: null,
      audience: { people: ["UA"], groups: [], everyone: false },
      questions: [1, 2, 3],
    });
    expect(problems.map((p) => p.field)).toEqual(["questions"]);
  });
});
