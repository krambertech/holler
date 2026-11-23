import { describe, expect, it } from "vitest";
import { localHour, nextReminder, reminderTiers, snoozeTarget } from "./reminders";

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

describe("the rhythm's rules hold everywhere", () => {
  const zones = [
    "UTC",
    "Europe/Tallinn",
    "America/New_York",
    "Asia/Kolkata",
    "Asia/Kathmandu",
    "Australia/Lord_Howe",
    "Pacific/Kiritimati",
    "Pacific/Pago_Pago",
    null,
  ];
  const HOUR = 3600_000;
  const starts = Array.from(
    { length: 200 },
    (_, i) => new Date(Date.UTC(2026, 2, 1) + i * 5 * HOUR),
  );
  const lengths = [24, 72, 168];

  it("lands only in working hours, after its tier and any snooze, and clear of the close", () => {
    let checked = 0;
    for (const timeZone of zones) {
      for (const invitedAt of starts) {
        for (const hours of lengths) {
          const closesAt = new Date(invitedAt.getTime() + hours * HOUR);
          for (const remindersSent of [0, 1, 2, 3]) {
            for (const snoozedUntil of [null, new Date(invitedAt.getTime() + 30 * HOUR)]) {
              const now = new Date(invitedAt.getTime() + 2 * HOUR);
              const next = nextReminder(
                { invitedAt, remindersSent, snoozedUntil, closesAt },
                timeZone,
                now,
              );
              if (remindersSent === 3) expect(next).toBeNull();
              if (!next) continue;
              checked++;
              const hour = localHour(next.dueAt, timeZone);
              const tier = reminderTiers[remindersSent];
              const where = `${timeZone} ${invitedAt.toISOString()} ${hours}h ${remindersSent}`;
              expect(hour >= 9 && hour < 18, `${where}: lands at ${hour}:00`).toBe(true);
              expect(next.tone).toBe(tier?.tone);
              expect(next.dueAt.getTime()).toBeGreaterThanOrEqual(
                invitedAt.getTime() + (tier?.afterHours ?? 0) * HOUR,
              );
              expect(next.dueAt.getTime()).toBeGreaterThanOrEqual(now.getTime());
              if (snoozedUntil) expect(next.dueAt >= snoozedUntil, where).toBe(true);
              expect(next.dueAt.getTime(), where).toBeLessThanOrEqual(
                closesAt.getTime() - 2 * HOUR,
              );
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it("snoozes to 15:00 today or 09:00 tomorrow, local, at every half hour", () => {
    for (const timeZone of zones) {
      for (let i = 0; i < 48 * 12; i++) {
        const now = new Date(Date.UTC(2026, 2, 25) + i * 30 * 60_000);
        const until = snoozeTarget(now, timeZone);
        const where = `${timeZone} ${now.toISOString()}`;
        expect(until > now, where).toBe(true);
        expect(until.getTime() - now.getTime(), where).toBeLessThanOrEqual(25 * HOUR);
        expect([9, 15], where).toContain(localHour(until, timeZone));
        expect(new Date(until).getUTCMinutes() % 15, where).toBe(0);
      }
    }
  });
});
