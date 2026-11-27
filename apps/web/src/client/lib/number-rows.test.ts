import { describe, expect, it } from "vitest";
import { numberRows } from "./number-rows";

const answers = (...values: number[]) =>
  values.map((value, i) => ({ value, slackUserId: `U${i}` }));

describe("numberRows", () => {
  it("draws nothing before anyone answers", () => {
    expect(numberRows([])).toEqual([]);
  });

  it("gives each value its own row, lowest first, while there are few", () => {
    const rows = numberRows(answers(3, 2, 3, 5));
    expect(rows.map((r) => [r.label, r.count])).toEqual([
      ["2", 1],
      ["3", 2],
      ["5", 1],
    ]);
    expect(rows[1]?.slackUserIds).toEqual(["U0", "U2"]);
  });

  it("groups values that spread wide into ranges that hold every answer", () => {
    const values = Array.from({ length: 40 }, (_, i) => i + 1);
    const rows = numberRows(answers(...values));
    expect(rows.length).toBeLessThanOrEqual(8);
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(40);
    expect(rows[0]?.label).toBe("0–9");
  });

  it("keeps an anonymous answer out of who picked it", () => {
    expect(numberRows([{ value: 1, slackUserId: null }])[0]?.slackUserIds).toEqual([]);
  });
});
