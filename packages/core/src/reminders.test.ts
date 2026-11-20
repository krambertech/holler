import { describe, expect, it } from "vitest";
import { nextReminder } from "./reminders";

const state = (overrides: Partial<Parameters<typeof nextReminder>[0]> = {}) => ({
  invitedAt: new Date("2026-11-16T09:00:00Z"),
  remindersSent: 0,
  snoozedUntil: null,
  closesAt: new Date("2026-11-23T18:00:00Z"),
  ...overrides,
});

describe("nextReminder", () => {
  it("sends a gentle reminder a day after the invite", () => {
    const next = nextReminder(state(), "UTC", new Date("2026-11-16T12:00:00Z"));
    expect(next).toEqual({ tone: "gentle", dueAt: new Date("2026-11-17T09:00:00Z") });
  });

  it("waits for 09:00 in the person's own time zone", () => {
    const next = nextReminder(
      state({ invitedAt: new Date("2026-11-16T20:00:00Z") }),
      "America/New_York",
      new Date("2026-11-16T21:00:00Z"),
    );
    // 20:00 UTC + 24h is 15:00 in New York, inside working hours.
    expect(next?.dueAt.toISOString()).toBe("2026-11-17T20:00:00.000Z");
  });

  it("moves to the snooze time when it is later", () => {
    const next = nextReminder(
      state({ snoozedUntil: new Date("2026-11-17T14:00:00Z") }),
      "UTC",
      new Date("2026-11-17T09:30:00Z"),
    );
    expect(next?.dueAt.toISOString()).toBe("2026-11-17T14:00:00.000Z");
  });

  it("stays quiet in the last two hours before the close time", () => {
    const next = nextReminder(
      state({ closesAt: new Date("2026-11-17T10:00:00Z") }),
      "UTC",
      new Date("2026-11-17T09:00:00Z"),
    );
    expect(next).toBeNull();
  });

  it("stops after the last tier", () => {
    expect(
      nextReminder(state({ remindersSent: 3 }), "UTC", new Date("2026-11-20T10:00:00Z")),
    ).toBeNull();
  });
});
