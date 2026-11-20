import { describe, expect, it } from "vitest";
import { canSend, monthStart, nextMonthStart, plans, remainingThisMonth } from "./plans";

describe("plans", () => {
  it("lets Free send its monthly number and no more", () => {
    const limit = plans.free.monthlyHollers;
    expect(canSend({ plan: "free", sentThisMonth: limit - 1 })).toBe(true);
    expect(canSend({ plan: "free", sentThisMonth: limit })).toBe(false);
    expect(remainingThisMonth({ plan: "free", sentThisMonth: limit + 4 })).toBe(0);
  });

  it("never limits Team", () => {
    expect(canSend({ plan: "team", sentThisMonth: 10_000 })).toBe(true);
  });

  it("counts calendar months in UTC", () => {
    const at = new Date("2026-12-31T23:30:00Z");
    expect(monthStart(at).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(nextMonthStart(at).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
