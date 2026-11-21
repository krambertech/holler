import { and, eq } from "@holler/core/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import type { ServiceContext } from "./context";
import { exportCsv, exportMarkdown } from "./exports";
import { makeLive, workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";
import { listOwnAnswers, ownAnswer } from "./own-answers";
import { recordResponse, resultsFor } from "./responses";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

const everyone = ["UA", "UB", "UC", "UD", "UE", "UF"];

function as(ctx: ServiceContext, slackUserId: string): ServiceContext {
  return { ...ctx, actor: { via: "web", recipientSlackUserId: slackUserId } };
}

async function survey(anonymous: boolean) {
  const fixture = await workspaceFixture(db);
  const holler = await createDraft(fixture.ctx, {
    mode: "survey",
    title: anonymous ? "Team health" : "Offsite",
    anonymous,
    questions: [
      {
        type: "single",
        prompt: "Where?",
        options: [{ label: "Lisbon" }, { label: "Tallinn" }],
        allowOther: true,
        followUp: { prompt: "Why there?", onlyAfter: null },
      },
      {
        type: "multi",
        prompt: "What to do?",
        options: [{ label: "Hike" }, { label: "Cook" }, { label: "Sail" }],
      },
      { type: "text", prompt: "Anything else?", required: false },
      { type: "number", prompt: "How many nights?", required: false },
      { type: "person", prompt: "Who plans it?", required: false },
    ],
  });
  await makeLive(db, holler.id, everyone, fixture.now);
  const [where, what, text, nights, who] = holler.questions;
  if (!where || !what || !text || !nights || !who) throw new Error("fixture questions missing");
  const [other] = await db
    .select()
    .from(schema.options)
    .where(and(eq(schema.options.questionId, where.id), eq(schema.options.isOther, true)));
  if (!other) throw new Error("fixture Other missing");
  const answerFull = (slackUserId: string) =>
    recordResponse(fixture.ctx, {
      hollerId: holler.id,
      slackUserId,
      via: "web",
      response: {
        answers: [
          { questionId: where.id, optionIds: [other.id], otherText: "Porto", note: "Warm" },
          {
            questionId: what.id,
            optionIds: [what.options[2]?.id ?? "", what.options[0]?.id ?? ""],
          },
          { questionId: text.id, text: "Bring coats" },
          { questionId: nights.id, number: 3 },
          { questionId: who.id, slackUserIds: ["UC"] },
        ],
      },
    });
  const answerShort = (slackUserId: string, optionIndex: number) =>
    recordResponse(fixture.ctx, {
      hollerId: holler.id,
      slackUserId,
      via: "slack_modal",
      response: {
        answers: [
          { questionId: where.id, optionIds: [where.options[optionIndex]?.id ?? ""] },
          { questionId: what.id, optionIds: [what.options[1]?.id ?? ""] },
        ],
      },
    });
  return { ...fixture, holler, answerFull, answerShort };
}

const fullGiven = [
  { prompt: "Where?", type: "single", picks: ["Porto"], note: "Warm" },
  { prompt: "What to do?", type: "multi", picks: ["Hike", "Sail"], note: null },
  { prompt: "Anything else?", type: "text", picks: ["Bring coats"], note: null },
  { prompt: "How many nights?", type: "number", picks: ["3"], note: null },
  { prompt: "Who plans it?", type: "person", picks: ["Person UC"], note: null },
];

describe("ownAnswer", () => {
  it("shows a named response's every answer as the person gave it", async () => {
    const { ctx, holler, answerFull } = await survey(false);
    await answerFull("UA");
    const mine = await ownAnswer(as(ctx, "UA"), holler.id);
    expect(mine.state).toBe("answered");
    expect(mine.given?.map(({ questionId: _, ...g }) => g)).toEqual(fullGiven);
  });

  it("shows an anonymous response to its own person through the private link", async () => {
    const { ctx, holler, answerFull, answerShort } = await survey(true);
    await answerFull("UA");
    await answerShort("UB", 1);
    const mine = await ownAnswer(as(ctx, "UA"), holler.id);
    expect(mine.anonymous).toBe(true);
    expect(mine.given?.map(({ questionId: _, ...g }) => g)).toEqual(fullGiven);
    const theirs = await ownAnswer(as(ctx, "UB"), holler.id);
    expect(theirs.given?.[0]?.picks).toEqual(["Tallinn"]);
  });

  it("keeps an anonymous response's own row free of the person", async () => {
    const { holler, answerFull } = await survey(true);
    await answerFull("UA");
    const rows = await db
      .select()
      .from(schema.responses)
      .where(eq(schema.responses.hollerId, holler.id));
    expect(rows.map((r) => r.slackUserId)).toEqual([null]);
  });

  it("says a person is still waiting, with the way back to their DM", async () => {
    const { ctx, holler } = await survey(false);
    await db
      .update(schema.recipients)
      .set({ dmChannelId: "DUA" })
      .where(eq(schema.recipients.slackUserId, "UA"));
    const mine = await ownAnswer(as(ctx, "UA"), holler.id);
    expect(mine).toMatchObject({ state: "waiting", given: null });
    expect(mine.slackUrl).toMatch(/^https:\/\/slack\.com\/app_redirect\?team=T.+&channel=DUA$/);
  });

  it("says a Holler closed before the person answered", async () => {
    const { ctx, holler } = await survey(false);
    await db
      .update(schema.hollers)
      .set({ status: "closed" })
      .where(eq(schema.hollers.id, holler.id));
    const mine = await ownAnswer(as(ctx, "UA"), holler.id);
    expect(mine).toMatchObject({ state: "missed", given: null, slackUrl: null });
  });

  it("shows nothing of a Holler the person was not sent", async () => {
    const { ctx, holler } = await survey(false);
    await expect(ownAnswer(as(ctx, "UZ"), holler.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("shows nothing of another workspace's Holler", async () => {
    const { holler, answerFull } = await survey(false);
    await answerFull("UA");
    const elsewhere = await workspaceFixture(db);
    await expect(ownAnswer(as(elsewhere.ctx, "UA"), holler.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("reads the person from a signed-in member", async () => {
    const { ctx, holler } = await survey(false);
    await makeLive(db, holler.id, ["ULEAD"], new Date());
    const mine = await ownAnswer(ctx, holler.id);
    expect(mine.state).toBe("waiting");
  });
});

describe("listOwnAnswers", () => {
  it("lists every Holler that reached the person, and nothing else", async () => {
    const { ctx, holler, answerShort } = await survey(false);
    await answerShort("UA", 0);
    const anonymous = await createDraft(ctx, {
      mode: "pulse",
      title: "",
      anonymous: true,
      questions: [{ type: "text", prompt: "How was your week?" }],
    });
    await makeLive(db, anonymous.id, ["UA"], new Date(ctx.now().getTime() + 3600_000));
    await createDraft(ctx, { mode: "survey", title: "Draft", questions: [] });
    const notYet = await createDraft(ctx, { mode: "chase", title: "Later", questions: [] });
    await makeLive(db, notYet.id, ["UA"], ctx.now());
    await db
      .update(schema.recipients)
      .set({ invitedAt: null })
      .where(eq(schema.recipients.hollerId, notYet.id));

    const list = await listOwnAnswers(as(ctx, "UA"));
    expect(list.map((h) => [h.title, h.state, h.anonymous])).toEqual([
      ["How was your week?", "waiting", true],
      ["Offsite", "answered", false],
    ]);
    expect(list[1]).toMatchObject({ id: holler.id, senderName: "Person ULEAD", slackUrl: null });
    expect(await listOwnAnswers(as(ctx, "UZ"))).toEqual([]);
  });
});

describe("the private link", () => {
  it("never reaches results or exports of an anonymous Holler", async () => {
    const { ctx, holler, answerFull, answerShort } = await survey(true);
    await answerFull("UA");
    for (const slackUserId of ["UB", "UC", "UD", "UE"]) await answerShort(slackUserId, 0);
    const linked = [
      JSON.stringify(await resultsFor(ctx, holler.id)),
      await exportCsv(ctx, holler.id),
      await exportMarkdown(ctx, holler.id),
    ];
    await db.delete(schema.responseOwners).where(eq(schema.responseOwners.hollerId, holler.id));
    const unlinked = [
      JSON.stringify(await resultsFor(ctx, holler.id)),
      await exportCsv(ctx, holler.id),
      await exportMarkdown(ctx, holler.id),
    ];
    expect(linked).toEqual(unlinked);
    for (const text of linked) {
      for (const id of ["UA", "UB", "UD", "UE"]) expect(text).not.toContain(id);
    }
  });

  it("holds one link per person per Holler", async () => {
    const { holler, answerShort } = await survey(true);
    await answerShort("UA", 0);
    await expect(answerShort("UA", 1)).rejects.toMatchObject({ code: "conflict" });
    const links = await db
      .select()
      .from(schema.responseOwners)
      .where(eq(schema.responseOwners.hollerId, holler.id));
    expect(links.map((l) => l.slackUserId)).toEqual(["UA"]);
  });
});
