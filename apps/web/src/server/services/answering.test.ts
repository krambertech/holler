import type { HollerDraftInput } from "@holler/core";
import { eq } from "@holler/core/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { readAnswers, type StateValue } from "../slack/blocks/modal";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import { answerFromSlack, answerViewFor, recipientContext } from "./answering";
import { sendHoller } from "./delivery";
import { workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());
beforeEach(() => emptyDatabase(raw));

const NOW = new Date("2026-11-20T10:00:00Z");

const everyType = {
  mode: "survey",
  title: "Offsite",
  audience: { people: ["UA"], groups: [], everyone: false },
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
      prompt: "Which days?",
      options: Array.from({ length: 12 }, (_, i) => ({ label: `Day ${i + 1}` })),
      maxChoices: 3,
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
    { type: "text", prompt: "Anything else?" },
  ],
} satisfies HollerDraftInput;

interface InputBlock {
  type: string;
  block_id: string;
  optional?: boolean;
  element: {
    type: string;
    options?: { value: string }[];
    min_value?: string;
    max_selected_items?: number;
  };
}

function fill(block: InputBlock): StateValue {
  const { element } = block;
  const first = element.options?.[0]?.value ?? "";
  switch (element.type) {
    case "radio_buttons":
    case "static_select":
      return { type: element.type, selected_option: { value: first } };
    case "checkboxes":
    case "multi_static_select":
      return { type: element.type, selected_options: (element.options ?? []).slice(0, 2) };
    case "plain_text_input":
      return { type: element.type, value: block.block_id.startsWith("other:") ? "" : "Some words" };
    case "number_input":
      return { type: element.type, value: element.min_value ?? "3" };
    case "users_select":
      return { type: element.type, selected_user: "UB" };
    case "multi_users_select":
      return { type: element.type, selected_users: ["UB", "UC"] };
    default:
      throw new Error(`No way to fill a ${element.type}; teach readAnswers and this test about it`);
  }
}

describe("the answer modal", () => {
  it("takes an answer to every question type and stores one for each", async () => {
    const { ctx } = await workspaceFixture(db, NOW);
    const { env } = deliveryEnv(db, raw);
    const holler = await createDraft(ctx, everyType);
    await sendHoller(ctx, env, holler.id);
    const recipient = recipientContext({ db, workspaceId: ctx.workspaceId, now: () => NOW }, "UA");

    const opened = await answerViewFor(recipient, holler.id, null);
    if (!("view" in opened)) throw new Error("expected a modal");
    const inputs = (opened.view.blocks as InputBlock[]).filter((block) => block.type === "input");
    const values = Object.fromEntries(
      inputs.map((block) => [block.block_id, { value: fill(block) }]),
    );

    const outcome = await answerFromSlack(recipient, holler.id, "slack_modal", readAnswers(values));
    expect(outcome).toMatchObject({ status: "answered" });
    if (outcome.status !== "answered") return;
    const stored = await db
      .select()
      .from(schema.answers)
      .where(eq(schema.answers.responseId, outcome.responseId));
    for (const question of holler.questions) {
      expect(
        stored.some((answer) => answer.questionId === question.id),
        question.prompt,
      ).toBe(true);
    }
    const notes = await db
      .select()
      .from(schema.answerNotes)
      .where(eq(schema.answerNotes.responseId, outcome.responseId));
    expect(notes.map((note) => [note.kind, note.text])).toEqual([["note", "Some words"]]);
  });

  it("puts a refusal beside the question it is about", async () => {
    const { ctx } = await workspaceFixture(db, NOW);
    const { env } = deliveryEnv(db, raw);
    const holler = await createDraft(ctx, everyType);
    await sendHoller(ctx, env, holler.id);
    const recipient = recipientContext({ db, workspaceId: ctx.workspaceId, now: () => NOW }, "UA");
    const where = holler.questions[0];
    const other = where?.options.find((option) => option.isOther);
    const outcome = await answerFromSlack(recipient, holler.id, "slack_modal", {
      answers: [{ questionId: where?.id ?? "", optionIds: [other?.id ?? ""] }],
    });
    expect(outcome).toEqual({
      status: "invalid",
      message: "Write your answer beside Other.",
      questionId: where?.id,
    });
  });
});
