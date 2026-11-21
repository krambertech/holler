import { describe, expect, it } from "vitest";
import { hollerDraftSchema, questionInputSchema } from "./types";

describe("questionInputSchema", () => {
  it("needs two options on a choice question", () => {
    const result = questionInputSchema.safeParse({
      type: "single",
      prompt: "Pick",
      options: [{ label: "A" }],
    });
    expect(result.success).toBe(false);
  });

  it("saves a half-written question in a draft", () => {
    const result = questionInputSchema.safeParse({
      type: "single",
      prompt: "",
      options: [{ label: "" }, { label: "" }],
    });
    expect(result.success).toBe(true);
  });

  it("keeps a pick limit within the options there are", () => {
    const base = { type: "multi", prompt: "Pick", options: [{ label: "A" }, { label: "B" }] };
    expect(questionInputSchema.safeParse({ ...base, maxChoices: 3 }).success).toBe(false);
    expect(
      questionInputSchema.safeParse({ ...base, maxChoices: 3, allowOther: true }).success,
    ).toBe(true);
  });

  it("refuses extras on the wrong kind of question", () => {
    const text = { type: "text", prompt: "Why?" };
    expect(questionInputSchema.safeParse({ ...text, allowOther: true }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...text, followUp: { prompt: "More?" } }).success).toBe(
      false,
    );
    expect(questionInputSchema.safeParse({ ...text, numberMin: 1 }).success).toBe(false);
  });

  it("keeps a numbered scale between 0 or 1 and 10", () => {
    const scale = (from: number, to: number) => ({
      type: "single",
      style: "scale",
      prompt: "How likely?",
      options: Array.from({ length: to - from + 1 }, (_, i) => ({
        label: String(from + i),
        score: from + i,
      })),
    });
    expect(questionInputSchema.safeParse(scale(0, 10)).success).toBe(true);
    expect(questionInputSchema.safeParse(scale(1, 11)).success).toBe(false);
    expect(questionInputSchema.safeParse(scale(2, 5)).success).toBe(false);
  });

  it("refuses options on a text question", () => {
    const result = questionInputSchema.safeParse({
      type: "text",
      prompt: "Why?",
      options: [{ label: "A" }, { label: "B" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("hollerDraftSchema", () => {
  it("fills a bare draft with defaults", () => {
    const draft = hollerDraftSchema.parse({ mode: "pulse" });
    expect(draft).toMatchObject({
      title: "",
      anonymous: false,
      visibility: "private",
      closeAfterHours: 72,
    });
  });

  it("lowercases tags", () => {
    expect(hollerDraftSchema.parse({ mode: "pulse", tags: ["Weekly"] }).tags).toEqual(["weekly"]);
  });
});
