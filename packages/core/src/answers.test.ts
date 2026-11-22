import { describe, expect, it } from "vitest";
import { answerProblem, type CheckedQuestion, noteAsked } from "./answers";

const choice = (over: Partial<CheckedQuestion> = {}): CheckedQuestion => ({
  type: "single",
  required: true,
  maxChoices: null,
  numberMin: null,
  numberMax: null,
  options: [
    { id: "o0", position: 0, isOther: false },
    { id: "o1", position: 1, isOther: false },
    { id: "oo", position: 2, isOther: true },
  ],
  followUp: null,
  ...over,
});

describe("noteAsked", () => {
  it("asks after any answer when onlyAfter is null, never before one", () => {
    const q = choice({ followUp: { onlyAfter: null } });
    expect(noteAsked(q, [])).toBe(false);
    expect(noteAsked(q, ["o0"])).toBe(true);
  });

  it("asks only after the options named by position, Other included", () => {
    const q = choice({ followUp: { onlyAfter: [1, 2] } });
    expect(noteAsked(q, ["o0"])).toBe(false);
    expect(noteAsked(q, ["o1"])).toBe(true);
    expect(noteAsked(q, ["oo"])).toBe(true);
  });

  it("never asks on a question without a follow-up", () => {
    expect(noteAsked(choice(), ["o0"])).toBe(false);
  });
});

describe("answerProblem", () => {
  it("needs an answer to a required question and lets an optional one be blank", () => {
    expect(answerProblem(choice(), undefined)).toBe("This question needs an answer.");
    expect(answerProblem(choice({ required: false }), undefined)).toBeNull();
    const text = choice({ type: "text", options: [] });
    expect(answerProblem(text, { text: "   " })).toBe("This question needs an answer.");
    expect(answerProblem(text, { text: "Fine" })).toBeNull();
  });

  it("wants Other's text exactly when Other is picked", () => {
    expect(answerProblem(choice(), { optionIds: ["oo"] })).toBe("Write your answer beside Other.");
    expect(answerProblem(choice(), { optionIds: ["o0"], otherText: "x" })).toBe(
      "Pick Other to add your own answer, or clear what you wrote.",
    );
    expect(answerProblem(choice(), { optionIds: ["oo"], otherText: "Riga" })).toBeNull();
  });

  it("refuses a note the picked answer does not ask for", () => {
    const q = choice({ followUp: { onlyAfter: [1] } });
    expect(answerProblem(q, { optionIds: ["o1"], note: "Because" })).toBeNull();
    expect(answerProblem(q, { optionIds: ["o0"], note: "Because" })).toBe(
      "That answer does not ask for a note. Clear the note, or pick another answer.",
    );
    expect(answerProblem(choice(), { optionIds: ["o0"], note: "x" })).toBe(
      "This question does not ask for a note.",
    );
  });

  it("holds multiple choice and people to the pick limit", () => {
    const multi = choice({ type: "multi", maxChoices: 1 });
    expect(answerProblem(multi, { optionIds: ["o0", "o1"] })).toBe("Pick one option.");
    const two = choice({ type: "multi", maxChoices: 2 });
    expect(answerProblem(two, { optionIds: ["o0", "o1", "oo"], otherText: "x" })).toBe(
      "Pick up to 2 options.",
    );
    const person = choice({ type: "person", options: [], maxChoices: 2 });
    expect(answerProblem(person, { slackUserIds: ["U1", "U2", "U3"] })).toBe(
      "Pick up to 2 people.",
    );
    expect(answerProblem(person, { slackUserIds: ["U1", "U1", "U2"] })).toBeNull();
  });

  it("keeps a number whole and in range", () => {
    const q = choice({ type: "number", options: [], numberMin: 1, numberMax: 10 });
    expect(answerProblem(q, { number: 11 })).toBe("Enter a whole number from 1 to 10.");
    expect(answerProblem(q, { number: 2.5 })).toBe("Enter a whole number.");
    expect(answerProblem(q, { number: 10 })).toBeNull();
  });

  it("refuses an option the question does not have", () => {
    expect(answerProblem(choice(), { optionIds: ["elsewhere"] })).toBe(
      "That choice is not one of this question's options.",
    );
  });
});
