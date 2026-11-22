import type { RespondQuestion } from "@holler/core";
import { describe, expect, it } from "vitest";
import {
  emptyAnswer,
  noteShown,
  otherShown,
  problemsOf,
  toggleOption,
  toResponse,
} from "./respond";

const where: RespondQuestion = {
  id: "q1",
  type: "single",
  style: "plain",
  prompt: "Where?",
  description: "",
  required: true,
  options: [
    { id: "lis", position: 0, label: "Lisbon", isOther: false },
    { id: "tal", position: 1, label: "Tallinn", isOther: false },
    { id: "oth", position: 2, label: "Other", isOther: true },
  ],
  maxChoices: null,
  followUp: { prompt: "Why there?", onlyAfter: [1, 2] },
  lowLabel: null,
  highLabel: null,
  numberMin: null,
  numberMax: null,
};

const days: RespondQuestion = {
  ...where,
  id: "q2",
  type: "multi",
  options: [0, 1, 2, 3].map((n) => ({
    id: `d${n}`,
    position: n,
    label: `Day ${n}`,
    isOther: false,
  })),
  maxChoices: 2,
  followUp: null,
};

const nights: RespondQuestion = {
  ...where,
  id: "q3",
  type: "number",
  options: [],
  followUp: null,
  numberMin: 1,
  numberMax: 7,
};

describe("the follow-up and Other", () => {
  it("shows each only while the answer that asks for it is picked", () => {
    const lisbon = { ...emptyAnswer(), optionIds: ["lis"] };
    const tallinn = { ...emptyAnswer(), optionIds: ["tal"] };
    const other = { ...emptyAnswer(), optionIds: ["oth"] };
    expect([noteShown(where, lisbon), noteShown(where, tallinn), noteShown(where, other)]).toEqual([
      false,
      true,
      true,
    ]);
    expect([otherShown(where, lisbon), otherShown(where, other)]).toEqual([false, true]);
    expect(noteShown(where, emptyAnswer())).toBe(false);
  });

  it("never sends a note or a write-in once its answer is unpicked", () => {
    const changed = { ...emptyAnswer(), optionIds: ["lis"], otherText: "Riga", note: "The sea" };
    expect(toResponse([where], { q1: changed }).answers).toEqual([
      { questionId: "q1", optionIds: ["lis"], otherText: null, note: null },
    ]);
    expect(problemsOf([where], { q1: changed })).toEqual({});
  });

  it("sends them while their answer is picked", () => {
    const kept = { ...emptyAnswer(), optionIds: ["oth"], otherText: " Riga ", note: "The sea" };
    expect(toResponse([where], { q1: kept }).answers).toEqual([
      { questionId: "q1", optionIds: ["oth"], otherText: "Riga", note: "The sea" },
    ]);
  });
});

describe("problems", () => {
  it("finds every question's problem at once, in the server's words", () => {
    const problems = problemsOf([where, days, nights], {
      q1: { ...emptyAnswer(), optionIds: ["oth"] },
      q3: { ...emptyAnswer(), number: "9" },
    });
    expect(problems).toEqual({
      q1: "Write your answer beside Other.",
      q2: "This question needs an answer.",
      q3: "Enter a whole number from 1 to 7.",
    });
  });

  it("says a number that is not whole is not whole, rather than that it is missing", () => {
    expect(problemsOf([nights], { q3: { ...emptyAnswer(), number: "2.5" } })).toEqual({
      q3: "Enter a whole number.",
    });
    expect(toResponse([nights], { q3: { ...emptyAnswer(), number: " 3 " } }).answers).toEqual([
      { questionId: "q3", number: 3 },
    ]);
  });
});

describe("toggleOption", () => {
  it("keeps one pick for single choice", () => {
    const picked = toggleOption(where, { ...emptyAnswer(), optionIds: ["lis"] }, "tal", true);
    expect(picked.optionIds).toEqual(["tal"]);
  });

  it("stops at the pick limit and keeps the question's order", () => {
    let draft = toggleOption(days, emptyAnswer(), "d2", true);
    draft = toggleOption(days, draft, "d0", true);
    expect(draft.optionIds).toEqual(["d0", "d2"]);
    expect(toggleOption(days, draft, "d3", true).optionIds).toEqual(["d0", "d2"]);
    expect(toggleOption(days, draft, "d2", false).optionIds).toEqual(["d0"]);
  });
});
