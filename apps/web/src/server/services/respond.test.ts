import {
  type HollerDraftInput,
  noteAsked,
  type RespondQuestion,
  type ResponseInput,
} from "@holler/core";
import { eq } from "@holler/core/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import { closeHoller, sendHoller } from "./delivery";
import { workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";
import { answerOnWeb, recipientFromLink, respondFormFor, respondPeople } from "./respond";
import { respondUrl } from "./respond-links";
import { devSlack } from "./slack-connection";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());
beforeEach(() => emptyDatabase(raw));

const NOW = new Date("2026-11-20T10:00:00Z");

const webOnly = {
  mode: "survey",
  title: "Offsite",
  description: "Two minutes. **Thank you.**",
  audience: { people: ["UA", "UB"], groups: [], everyone: false },
  questions: [
    {
      type: "single",
      prompt: "Where?",
      options: [{ label: "Lisbon" }, { label: "Tallinn" }, { label: "Riga" }],
      allowOther: true,
      followUp: { prompt: "Why there?", onlyAfter: [1, 3] },
    },
    {
      type: "multi",
      prompt: "Which days?",
      options: Array.from({ length: 12 }, (_, i) => ({ label: `Day ${i + 1}` })),
      maxChoices: 3,
      followUp: { prompt: "Anything to add?", onlyAfter: null },
    },
    {
      type: "single",
      style: "scale",
      prompt: "How calm?",
      options: ["1", "2", "3", "4", "5"].map((label) => ({ label })),
      lowLabel: "Chaos",
      highLabel: "Calm",
    },
    {
      type: "single",
      style: "binary",
      prompt: "Flying?",
      options: [{ label: "Yes" }, { label: "No" }],
    },
    { type: "number", prompt: "How many nights?", numberMin: 1, numberMax: 7 },
    { type: "person", prompt: "Who plans it?", maxChoices: 2 },
    { type: "text", prompt: "Anything else?", required: false },
  ],
} satisfies HollerDraftInput;

async function live(draft: Partial<HollerDraftInput> = {}) {
  const fixture = await workspaceFixture(db, NOW);
  const slack = await devSlack(db, fixture.workspaceId);
  const harness = deliveryEnv(db, raw);
  const holler = await createDraft(fixture.ctx, { ...webOnly, ...draft });
  await sendHoller(fixture.ctx, harness.env, holler.id);
  await harness.drain(NOW);
  const linkOf = async (slackUserId: string) => {
    const url = new URL(await respondUrl(harness.env, holler.id, slackUserId));
    return { u: url.searchParams.get("u") ?? "", s: url.searchParams.get("s") ?? "" };
  };
  const as = async (slackUserId: string) =>
    recipientFromLink({ db, now: () => NOW }, harness.env, holler.id, await linkOf(slackUserId));
  return { ...fixture, ...harness, slack, holler, linkOf, as };
}

function fill(question: RespondQuestion): ResponseInput["answers"][number] {
  const plain = question.options.filter((o) => !o.isOther);
  switch (question.type) {
    case "single":
      return { questionId: question.id, optionIds: [plain[0]?.id ?? ""] };
    case "multi":
      return {
        questionId: question.id,
        optionIds: plain.slice(0, 2).map((o) => o.id),
        note: "Weekdays suit me",
      };
    case "number":
      return { questionId: question.id, number: question.numberMin ?? 3 };
    case "person":
      return { questionId: question.id, slackUserIds: ["UB", "UC"] };
    case "text":
      return { questionId: question.id, text: "Some words" };
    default:
      throw new Error(`No way to fill a ${question.type} question; teach the web form about it`);
  }
}

describe("the signed link", () => {
  it("opens the form only for the person and Holler it was made for", async () => {
    const { env, holler, linkOf } = await live();
    const base = { db, now: () => NOW };
    const mine = await linkOf("UA");
    await expect(recipientFromLink(base, env, holler.id, mine)).resolves.toMatchObject({
      actor: { via: "web", recipientSlackUserId: "UA" },
    });
    await expect(
      recipientFromLink(base, env, holler.id, { ...mine, u: "UB" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(recipientFromLink(base, env, "hol_other", mine)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      recipientFromLink(base, env, holler.id, { ...mine, s: "x".repeat(43) }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses a well-signed link for someone the Holler was not sent to", async () => {
    const { holler, as } = await live();
    await expect(respondFormFor(await as("UF"), holler.id)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("the form", () => {
  it("shows every question, with Other last and the follow-up's options by position", async () => {
    const { holler, as } = await live();
    const form = await respondFormFor(await as("UA"), holler.id);
    if (form.state !== "open") throw new Error("expected an open form");
    expect(form.holler).toMatchObject({
      title: "Offsite",
      description: "Two minutes. **Thank you.**",
      senderName: "Person ULEAD",
      anonymous: false,
    });
    expect(form.questions.map((q) => q.prompt)).toEqual(webOnly.questions.map((q) => q.prompt));
    const where = form.questions[0];
    expect(where?.options.map((o) => [o.label, o.position, o.isOther])).toEqual([
      ["Lisbon", 0, false],
      ["Tallinn", 1, false],
      ["Riga", 2, false],
      ["Other", 3, true],
    ]);
  });

  it("shows a follow-up for exactly the answers the server takes a note for", async () => {
    for (const optionIndex of [0, 1, 2, 3]) {
      await emptyDatabase(raw);
      const { env, holler, as } = await live();
      const ctx = await as("UA");
      const form = await respondFormFor(ctx, holler.id);
      if (form.state !== "open") throw new Error("expected an open form");
      const [where, ...rest] = form.questions;
      if (!where) throw new Error("expected the first question");
      const picked = where.options[optionIndex];
      if (!picked) throw new Error("expected the option");
      const answers = [
        {
          questionId: where.id,
          optionIds: [picked.id],
          otherText: picked.isOther ? "Riga in summer" : null,
          note: "Because of the sea",
        },
        ...rest.map(fill),
      ];
      const shown = noteAsked(where, [picked.id]);
      const stored = answerOnWeb(ctx, env, holler.id, { answers });
      if (shown) await expect(stored).resolves.toMatchObject({ state: "answered" });
      else await expect(stored).rejects.toMatchObject({ code: "invalid", field: where.id });
    }
  });

  it("takes an answer to every question type, then thanks them in their DM", async () => {
    const { env, holler, as, drain, slack } = await live();
    const ctx = await as("UA");
    const form = await respondFormFor(ctx, holler.id);
    if (form.state !== "open") throw new Error("expected an open form");
    const after = await answerOnWeb(ctx, env, holler.id, { answers: form.questions.map(fill) });
    expect(after.state).toBe("answered");

    const [response] = await db
      .select()
      .from(schema.responses)
      .where(eq(schema.responses.hollerId, holler.id));
    expect(response).toMatchObject({ via: "web", slackUserId: "UA" });
    const stored = await db
      .select()
      .from(schema.answers)
      .where(eq(schema.answers.responseId, response?.id ?? ""));
    for (const question of form.questions) {
      if (question.type === "text" && !question.required) continue;
      expect(
        stored.some((a) => a.questionId === question.id),
        question.prompt,
      ).toBe(true);
    }

    const invite = slack.posted.find((message) => message.text.includes("Offsite"));
    await drain(NOW);
    const edit = slack.updated.find((message) => message.ts === invite?.ts);
    expect(edit?.text).toBe("Thanks. Your answer to Offsite is in.");
  });

  it("reads their own answers back once they answered, Other's words and the note included", async () => {
    const { env, holler, as } = await live();
    const ctx = await as("UA");
    const form = await respondFormFor(ctx, holler.id);
    if (form.state !== "open") throw new Error("expected an open form");
    const [where, ...rest] = form.questions;
    if (!where) throw new Error("expected the first question");
    const other = where.options.find((o) => o.isOther);
    const answers = [
      { questionId: where.id, optionIds: [other?.id ?? ""], otherText: "Helsinki", note: "Sauna" },
      ...rest.map(fill),
    ];
    const after = await answerOnWeb(ctx, env, holler.id, { answers });
    if (after.state !== "answered") throw new Error("expected the answered state");
    expect(after.given?.map((g) => g.prompt)).toEqual(form.questions.map((q) => q.prompt));
    expect(after.given?.[0]).toMatchObject({ picks: ["Helsinki"], note: "Sauna" });
    const days = after.given?.find((g) => g.prompt === "Which days?");
    expect(days).toMatchObject({ picks: ["Day 1", "Day 2"], note: "Weekdays suit me" });
    expect(after.given?.find((g) => g.prompt === "How many nights?")?.picks).toEqual(["1"]);
    expect(after.given?.find((g) => g.prompt === "How calm?")?.picks).toEqual(["1, Chaos"]);
    expect(after.given?.find((g) => g.prompt === "Anything else?")?.picks).toEqual(["Some words"]);
    expect(after.given?.find((g) => g.prompt === "Who plans it?")?.picks).toHaveLength(2);
  });

  it("keeps no name on an anonymous Holler's answers", async () => {
    const { env, holler, as } = await live({ anonymous: true });
    const ctx = await as("UA");
    const form = await respondFormFor(ctx, holler.id);
    if (form.state !== "open") throw new Error("expected an open form");
    expect(form.holler.anonymous).toBe(true);
    await answerOnWeb(ctx, env, holler.id, { answers: form.questions.map(fill) });
    const [response] = await db
      .select()
      .from(schema.responses)
      .where(eq(schema.responses.hollerId, holler.id));
    expect(response?.slackUserId).toBeNull();
    await expect(respondFormFor(ctx, holler.id)).resolves.toMatchObject({
      state: "answered",
      given: null,
    });
  });

  it("says they answered on a second visit and on a second submit", async () => {
    const { env, holler, as } = await live();
    const ctx = await as("UA");
    const form = await respondFormFor(ctx, holler.id);
    if (form.state !== "open") throw new Error("expected an open form");
    const answers = { answers: form.questions.map(fill) };
    await answerOnWeb(ctx, env, holler.id, answers);
    await expect(respondFormFor(ctx, holler.id)).resolves.toMatchObject({ state: "answered" });
    await expect(answerOnWeb(ctx, env, holler.id, answers)).resolves.toMatchObject({
      state: "answered",
    });
    const responses = await db
      .select()
      .from(schema.responses)
      .where(eq(schema.responses.hollerId, holler.id));
    expect(responses).toHaveLength(1);
  });

  it("puts the DM right when the answers were kept but the queue refused, once they send again", async () => {
    const { env, holler, as, drain, slack, refuse } = await live();
    const ctx = await as("UA");
    const form = await respondFormFor(ctx, holler.id);
    if (form.state !== "open") throw new Error("expected an open form");
    const answers = { answers: form.questions.map(fill) };
    refuse.add("answered");
    await expect(answerOnWeb(ctx, env, holler.id, answers)).rejects.toThrow(/refusing answered/);
    refuse.delete("answered");
    await expect(answerOnWeb(ctx, env, holler.id, answers)).resolves.toMatchObject({
      state: "answered",
    });
    const invite = slack.posted.find((message) => message.text.includes("Offsite"));
    await drain(NOW);
    const edit = slack.updated.find((message) => message.ts === invite?.ts);
    expect(edit?.text).toBe("Thanks. Your answer to Offsite is in.");
  });

  it("shows the closed state, and keeps nothing sent after the close", async () => {
    const { ctx: lead, env, holler, as } = await live();
    const ctx = await as("UA");
    const form = await respondFormFor(ctx, holler.id);
    if (form.state !== "open") throw new Error("expected an open form");
    await closeHoller(lead, env, holler.id);
    await expect(respondFormFor(ctx, holler.id)).resolves.toMatchObject({ state: "closed" });
    await expect(
      answerOnWeb(ctx, env, holler.id, { answers: form.questions.map(fill) }),
    ).resolves.toMatchObject({ state: "closed" });
    const responses = await db
      .select()
      .from(schema.responses)
      .where(eq(schema.responses.hollerId, holler.id));
    expect(responses).toHaveLength(0);
  });

  it("puts a refusal beside the question it is about", async () => {
    const { env, holler, as } = await live();
    const ctx = await as("UA");
    const form = await respondFormFor(ctx, holler.id);
    if (form.state !== "open") throw new Error("expected an open form");
    const where = form.questions[0];
    const other = where?.options.find((o) => o.isOther);
    await expect(
      answerOnWeb(ctx, env, holler.id, {
        answers: [{ questionId: where?.id ?? "", optionIds: [other?.id ?? ""] }],
      }),
    ).rejects.toMatchObject({
      code: "invalid",
      field: where?.id,
      message: "Write your answer beside Other.",
    });
  });
});

describe("people for a person question", () => {
  it("searches the workspace for someone still answering", async () => {
    const { holler, as } = await live();
    const people = await respondPeople(await as("UA"), holler.id, "person ub");
    expect(people.map((p) => p.slackUserId)).toEqual(["UB"]);
  });

  it("gives the directory to nobody once they answered", async () => {
    const { env, holler, as } = await live();
    const ctx = await as("UA");
    const form = await respondFormFor(ctx, holler.id);
    if (form.state !== "open") throw new Error("expected an open form");
    await answerOnWeb(ctx, env, holler.id, { answers: form.questions.map(fill) });
    await expect(respondPeople(ctx, holler.id, "")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("gives the directory to nobody on a Holler that asks for no one", async () => {
    const [where] = webOnly.questions;
    if (!where) throw new Error("expected the first question");
    const plain = await live({ questions: [where] });
    await expect(respondPeople(await plain.as("UA"), plain.holler.id, "")).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
