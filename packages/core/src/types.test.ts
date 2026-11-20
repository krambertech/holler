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
