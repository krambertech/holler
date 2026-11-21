import { describe, expect, it } from "vitest";
import { momentLabel } from "./format";

describe("momentLabel", () => {
  const now = new Date(2026, 10, 20, 10, 0);
  const at = (days: number, hour: number, minute = 0) =>
    new Date(2026, 10, 20 + days, hour, minute).toISOString();

  it("says today and tomorrow in words, with the time", () => {
    expect(momentLabel(at(0, 14, 5), now)).toMatch(/^today at 14:05$/);
    expect(momentLabel(at(1, 9), now)).toMatch(/^tomorrow at 09:00$/);
  });

  it("names the weekday within the week, then the date", () => {
    expect(momentLabel(at(3, 10), now)).toMatch(/^\S+ at 10:00$/);
    expect(momentLabel(at(10, 10), now)).toMatch(/^\d+ \S+ at 10:00$|^\S+ \d+ at 10:00$/);
  });
});
