import { describe, expect, it } from "vitest";
import { addMonths, dayFromKey, dayKey, monthWeeks } from "./calendar";

describe("calendar", () => {
  it("lays a month out in Monday-first weeks", () => {
    const weeks = monthWeeks(2026, 10);
    expect(weeks[0]?.[0]).toMatchObject({ year: 2026, month: 9, day: 26, inMonth: false });
    expect(weeks[0]?.[6]).toMatchObject({ month: 10, day: 1, inMonth: true });
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("keeps the day when a month is shorter", () => {
    expect(dayKey(addMonths({ year: 2026, month: 0, day: 31 }, 1))).toBe("2026-02-28");
  });

  it("moves by day, week and month with the keys", () => {
    const at = { year: 2026, month: 10, day: 30 };
    expect(dayKey(dayFromKey("ArrowRight", at))).toBe("2026-12-01");
    expect(dayKey(dayFromKey("ArrowLeft", at, true))).toBe("2026-12-01");
    expect(dayKey(dayFromKey("ArrowUp", at))).toBe("2026-11-23");
    expect(dayKey(dayFromKey("PageDown", at))).toBe("2026-12-30");
    expect(dayKey(dayFromKey("Home", at))).toBe("2026-11-30");
    expect(dayKey(dayFromKey("End", at))).toBe("2026-12-06");
  });
});
