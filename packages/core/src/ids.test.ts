import { describe, expect, it } from "vitest";
import { isId, newId, newReportToken } from "./ids";

describe("ids", () => {
  it("prefixes the kind and passes its own check", () => {
    const id = newId("holler");
    expect(id).toMatch(/^hol_/);
    expect(isId("holler", id)).toBe(true);
    expect(isId("question", id)).toBe(false);
  });

  it("makes long report tokens", () => {
    expect(newReportToken()).toHaveLength(32);
  });
});
