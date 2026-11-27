import { describe, expect, it } from "vitest";
import { closingStop } from "./sentence";

describe("closingStop", () => {
  it("ends a sentence on a title once, whatever the title ends with", () => {
    for (const title of ["How was your week?", "Ship it!", "Q4 plans.", "Wait…", "Say “yes.”"]) {
      expect(`${title}${closingStop(title)}`).not.toMatch(/[.?!…]["'”’)]*\.$/);
    }
    expect(closingStop("Submit your Q4 expenses")).toBe(".");
    expect(closingStop("Offsite: which dates work? ")).toBe("");
  });
});
