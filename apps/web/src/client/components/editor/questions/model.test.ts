import { questionInputSchema, questionTemplates, templateFor } from "@holler/core";
import { describe, expect, it } from "vitest";
import {
  addOption,
  changeTemplate,
  duplicateQuestion,
  type EditorQuestion,
  filled,
  inOrder,
  moveQuestion,
  orderProblems,
  pastedLabels,
  problemsByKey,
  questionFromTemplate,
  removeOption,
  scaleRange,
  setAllowOther,
  setScaleRange,
  withKey,
} from "./model";

/** The shape the server accepts. Every helper must hand back a question that passes it. */
function valid(q: EditorQuestion) {
  const { key: _key, ...input } = q;
  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  return parsed.data;
}

const multi = (): EditorQuestion =>
  withKey(
    {
      type: "multi",
      prompt: "Which bets first?",
      description: "Think about what unblocks the most people.",
      required: false,
      options: [{ label: "Onboarding" }, { label: "Billing" }, { label: "Mobile" }],
      allowOther: true,
      maxChoices: 3,
      followUp: { prompt: "Which platform?", onlyAfter: [2] },
    },
    "q1",
  );

describe("questionFromTemplate", () => {
  it.each(questionTemplates.map((t) => t.id))(
    "makes a valid %s question its template names",
    (id) => {
      const q = questionFromTemplate(id);
      valid(q);
      expect(templateFor(filled(q)).id).toBe(id);
    },
  );

  it("gives a plain choice question two empty options to write in", () => {
    expect(filled(questionFromTemplate("single")).options).toEqual([{ label: "" }, { label: "" }]);
  });

  it("gives every question its own key", () => {
    expect(questionFromTemplate("text").key).not.toBe(questionFromTemplate("text").key);
  });
});

describe("changeTemplate", () => {
  it("keeps the prompt, description, Required and key", () => {
    const next = filled(changeTemplate(multi(), "text"));
    expect(next).toMatchObject({
      key: "q1",
      prompt: "Which bets first?",
      description: "Think about what unblocks the most people.",
      required: false,
    });
  });

  it("keeps plain options, Other and the follow-up between single and multiple choice", () => {
    const single = filled(changeTemplate(multi(), "single"));
    expect(single.options.map((o) => o.label)).toEqual(["Onboarding", "Billing", "Mobile"]);
    expect(single.allowOther).toBe(true);
    expect(single.followUp).toEqual({ prompt: "Which platform?", onlyAfter: [2] });
    expect(single.maxChoices).toBeNull();
    valid(changeTemplate(multi(), "single"));
  });

  it("keeps a pick limit only on multiple choice", () => {
    const back = changeTemplate(changeTemplate(multi(), "single"), "multi");
    expect(filled(back).maxChoices).toBeNull();
    expect(filled(changeTemplate(multi(), "person")).maxChoices).toBeNull();
  });

  it("swaps plain options for the scale's own and drops Other", () => {
    const rating = filled(changeTemplate(multi(), "rating"));
    expect(rating.options.map((o) => o.label)).toEqual(["1", "2", "3", "4", "5"]);
    expect(rating.allowOther).toBe(false);
    // The follow-up named "Mobile", which a rating does not have.
    expect(rating.followUp).toEqual({ prompt: "Which platform?", onlyAfter: null });
  });

  it("drops options and the follow-up for a question that has none", () => {
    for (const id of ["text", "number", "person"]) {
      const q = filled(changeTemplate(multi(), id));
      expect(q.options).toEqual([]);
      expect(q.followUp).toBeNull();
      valid(changeTemplate(multi(), id));
    }
  });

  it("drops a scale's end words and a number's bounds", () => {
    const scale = setScaleRange(questionFromTemplate("scale"), 0, 10);
    const words = { ...scale, lowLabel: "Not at all", highLabel: "Completely" };
    expect(filled(changeTemplate(words, "agreement"))).toMatchObject({
      lowLabel: null,
      highLabel: null,
    });
    const number = { ...questionFromTemplate("number"), numberMin: 0, numberMax: 30 };
    expect(filled(changeTemplate(number, "text"))).toMatchObject({
      numberMin: null,
      numberMax: null,
    });
  });

  it("starts a number question at 0 or more, whichever way it is made", () => {
    expect(filled(questionFromTemplate("number"))).toMatchObject({ numberMin: 0, numberMax: null });
    expect(filled(changeTemplate(questionFromTemplate("text"), "number"))).toMatchObject({
      numberMin: 0,
      numberMax: null,
    });
    valid(questionFromTemplate("number"));
  });

  it("gives an empty plain question two rows when it comes from yes or no", () => {
    const plain = filled(changeTemplate(questionFromTemplate("binary"), "multi"));
    expect(plain.options).toEqual([{ label: "" }, { label: "" }]);
  });

  it("leaves the question alone when the type does not change", () => {
    const q = multi();
    expect(changeTemplate(q, "multi")).toEqual(q);
  });

  it("makes a valid question from every template to every other", () => {
    for (const from of questionTemplates) {
      for (const to of questionTemplates) {
        const q = changeTemplate(questionFromTemplate(from.id), to.id);
        valid(q);
        expect(templateFor(filled(q)).id).toBe(to.id);
      }
    }
  });
});

describe("options", () => {
  it("moves a follow-up's positions when an option goes in before them", () => {
    // Positions: 0 Onboarding, 1 Billing, 2 Mobile, 3 Other.
    const q = { ...multi(), followUp: { prompt: "Why?", onlyAfter: [1, 3] } };
    expect(filled(addOption(q, 0)).followUp?.onlyAfter).toEqual([2, 4]);
    expect(filled(addOption(q)).followUp?.onlyAfter).toEqual([1, 4]);
  });

  it("forgets a removed option in the follow-up and in the pick limit", () => {
    const q = { ...multi(), allowOther: false, followUp: { prompt: "Why?", onlyAfter: [1, 2] } };
    const next = filled(removeOption(q, 1));
    expect(next.options.map((o) => o.label)).toEqual(["Onboarding", "Mobile"]);
    expect(next.followUp?.onlyAfter).toEqual([1]);
    expect(next.maxChoices).toBe(2);
    valid(removeOption(q, 1));
  });

  it("falls back to after any answer when the only option it named goes", () => {
    const q = { ...multi(), followUp: { prompt: "Why?", onlyAfter: [0] } };
    expect(filled(removeOption(q, 0)).followUp?.onlyAfter).toBeNull();
  });

  it("keeps at least two options", () => {
    const q = questionFromTemplate("single");
    expect(removeOption(q, 0)).toEqual(q);
  });

  it("takes Other out of the follow-up and the pick limit when it goes", () => {
    const q = { ...multi(), maxChoices: 4, followUp: { prompt: "Why?", onlyAfter: [3] } };
    const next = filled(setAllowOther(q, false));
    expect(next.allowOther).toBe(false);
    expect(next.followUp?.onlyAfter).toBeNull();
    expect(next.maxChoices).toBe(3);
    valid(setAllowOther(q, false));
  });

  it("adds Other only to a plain choice question", () => {
    const rating = questionFromTemplate("rating");
    expect(setAllowOther(rating, true)).toEqual(rating);
    expect(filled(setAllowOther(questionFromTemplate("single"), true)).allowOther).toBe(true);
  });
});

describe("scales", () => {
  it("reads and sets a numbered range", () => {
    const q = setScaleRange(questionFromTemplate("scale"), 0, 10);
    expect(scaleRange(q)).toEqual({ from: 0, to: 10 });
    expect(filled(q).options).toHaveLength(11);
    valid(q);
  });

  it("keeps a range inside 0 or 1 to between 2 and 10", () => {
    expect(scaleRange(setScaleRange(questionFromTemplate("scale"), 3, 40))).toEqual({
      from: 1,
      to: 10,
    });
  });

  it("has no range for a scale of words", () => {
    expect(scaleRange(questionFromTemplate("agreement"))).toBeNull();
  });
});

describe("moving", () => {
  it("moves a question up and down", () => {
    expect(moveQuestion(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveQuestion(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveQuestion(["a", "b", "c"], 1, 9)).toEqual(["a", "c", "b"]);
  });

  it("puts questions in a dragged order", () => {
    const list = [{ key: "a" }, { key: "b" }, { key: "c" }];
    expect(inOrder(list, ["c", "a", "b"]).map((q) => q.key)).toEqual(["c", "a", "b"]);
    expect(inOrder(list, ["b"]).map((q) => q.key)).toEqual(["b", "a", "c"]);
  });

  it("duplicates as a new question without the stored id", () => {
    const original = {
      ...multi(),
      id: "stored",
      options: [
        { id: "o1", label: "A" },
        { id: "o2", label: "B" },
      ],
    };
    const copy = duplicateQuestion(original);
    expect(copy.key).not.toBe(original.key);
    expect(copy.id).toBeUndefined();
    expect(filled(copy).options.every((o) => o.id === undefined)).toBe(true);
    expect(copy.prompt).toBe(original.prompt);
  });
});

describe("problemsByKey", () => {
  it("pins each problem to its question's key", () => {
    const questions = [{ key: "a" }, { key: "b" }];
    const { list, byKey } = problemsByKey(
      {
        questions: "Add a question.",
        "questions.1.prompt": "Write the question.",
        "questions.1.options.2": "Name this option.",
        "questions.0": "Something is wrong here.",
        "questions.7.prompt": "A question that is gone.",
        title: "Give it a title.",
      },
      questions,
    );
    expect(list).toBe("Add a question.");
    expect(byKey.get("b")).toEqual({
      prompt: "Write the question.",
      "options.2": "Name this option.",
    });
    expect(byKey.get("a")).toEqual({ "": "Something is wrong here." });
    expect(byKey.size).toBe(2);
  });
});

describe("scale kinds", () => {
  const recommend = () => questionFromTemplate("recommend");

  it("reads a ready scale by its steps and end words, and anything else as custom", () => {
    expect(templateFor(filled(recommend())).id).toBe("recommend");
    expect(templateFor({ ...filled(recommend()), highLabel: "Very likely" }).id).toBe("scale");
    expect(templateFor({ ...filled(recommend()), lowLabel: null, highLabel: null }).id).toBe(
      "scale",
    );
    expect(templateFor(filled(questionFromTemplate("rating"))).id).toBe("rating");
  });

  it("keeps a numbered scale's steps when it is made custom", () => {
    const custom = filled(changeTemplate(recommend(), "scale"));
    expect(scaleRange(custom)).toEqual({ from: 0, to: 10 });
    expect(custom).toMatchObject({ lowLabel: "", highLabel: "" });
    expect(templateFor(custom).id).toBe("scale");
    valid(custom);
  });

  it("keeps a follow-up on the same numbers when the range changes", () => {
    const scale = {
      ...setScaleRange(questionFromTemplate("scale"), 1, 5),
      followUp: { prompt: "Why?", onlyAfter: [3, 4] },
    };
    // Steps 4 and 5 stay steps 4 and 5 when the scale starts at 0 instead of 1.
    expect(filled(setScaleRange(scale, 0, 5)).followUp?.onlyAfter).toEqual([4, 5]);
    // Cut to 1–4, only step 4 is left.
    expect(filled(setScaleRange(scale, 1, 4)).followUp?.onlyAfter).toEqual([3]);
    // Cut to 1–3, neither is: the note follows any answer.
    expect(filled(setScaleRange(scale, 1, 3)).followUp?.onlyAfter).toBeNull();
  });
});

describe("pastedLabels", () => {
  it("makes one option per line, joining the first to the row's own words", () => {
    expect(pastedLabels("Big", "Lisbon\nPorto\n\nTallinn", 10)).toEqual({
      first: "Big Lisbon",
      added: ["Porto", "Tallinn"],
    });
  });

  it("leaves a single line to the input", () => {
    expect(pastedLabels("", "Lisbon", 10)).toBeUndefined();
  });

  it("cuts every label to what the schema takes", () => {
    const long = "x".repeat(200);
    const pasted = pastedLabels("y".repeat(100), `${long}\n${long}`, 10);
    expect(pasted?.first).toHaveLength(150);
    expect(pasted?.added[0]).toHaveLength(150);
  });

  it("adds no more options than there is room for", () => {
    expect(pastedLabels("", "a\nb\nc\nd", 2)?.added).toEqual(["b", "c"]);
  });
});

describe("orderProblems", () => {
  it("reads a card's problems from top to bottom, options by their place", () => {
    const ordered = orderProblems({
      numberMax: "Too big.",
      "options.10": "Name option 11.",
      prompt: "Write the question.",
      "options.2": "Name option 3.",
      "": "Something about the whole question.",
    });
    expect(ordered.map((p) => p.message)).toEqual([
      "Write the question.",
      "Name option 3.",
      "Name option 11.",
      "Too big.",
      "Something about the whole question.",
    ]);
  });

  it("says a message once and keeps every field it belongs to", () => {
    expect(orderProblems({ numberMin: "Swap them.", numberMax: "Swap them." })).toEqual([
      { message: "Swap them.", paths: ["numberMin", "numberMax"] },
    ]);
  });
});
