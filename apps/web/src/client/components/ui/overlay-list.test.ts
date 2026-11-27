import { describe, expect, it } from "vitest";
import { listRowClassName } from "./overlay-list";

describe("a row in a menu, select or combobox", () => {
  it("grows with two lines of text instead of a fixed height that clips them", () => {
    const fixedHeights = listRowClassName.split(" ").filter((c) => /^(\w+:)*h-/.test(c));
    expect(fixedHeights).toEqual([]);
    expect(listRowClassName).toMatch(/\bmin-h-/);
  });
});
