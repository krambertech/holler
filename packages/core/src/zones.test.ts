import { describe, expect, it } from "vitest";
import { snoozeTarget } from "./reminders";
import { earliestInstantOf, instantOf, sameWallClockIn, wallClockIn } from "./zones";

describe("zones", () => {
  it("reads the wall clock in a zone", () => {
    expect(wallClockIn(new Date("2026-11-23T07:00:00Z"), "Europe/Tallinn")).toEqual({
      year: 2026,
      month: 11,
      day: 23,
      hour: 9,
      minute: 0,
    });
  });

  it("finds the instant of a wall-clock time across daylight saving", () => {
    const wall = { year: 2026, month: 7, day: 6, hour: 9, minute: 0 };
    expect(instantOf(wall, "Europe/Tallinn").toISOString()).toBe("2026-07-06T06:00:00.000Z");
    expect(instantOf(wall, "America/New_York").toISOString()).toBe("2026-07-06T13:00:00.000Z");
  });

  it("moves Monday 09:00 in Tallinn to Monday 09:00 in Tokyo", () => {
    const tallinn = new Date("2026-11-23T07:00:00Z");
    expect(sameWallClockIn(tallinn, "Europe/Tallinn", "Asia/Tokyo").toISOString()).toBe(
      "2026-11-23T00:00:00.000Z",
    );
  });

  it("treats an unknown zone as UTC", () => {
    const at = new Date("2026-11-23T07:00:00Z");
    expect(sameWallClockIn(at, "UTC", "Not/AZone").toISOString()).toBe(at.toISOString());
  });

  it("knows when the first zone reaches a time", () => {
    const at = new Date("2026-11-23T07:00:00Z");
    // 09:00 in Tallinn is 09:00 in Kiribati 14 hours earlier than in UTC.
    expect(earliestInstantOf(at, "Europe/Tallinn").toISOString()).toBe("2026-11-22T19:00:00.000Z");
  });
});

describe("snoozeTarget", () => {
  it("snoozes to 15:00 today in the morning", () => {
    expect(snoozeTarget(new Date("2026-11-23T08:00:00Z"), "Europe/Tallinn").toISOString()).toBe(
      "2026-11-23T13:00:00.000Z",
    );
  });

  it("snoozes to 09:00 tomorrow from 15:00 on", () => {
    expect(snoozeTarget(new Date("2026-11-23T13:30:00Z"), "Europe/Tallinn").toISOString()).toBe(
      "2026-11-24T07:00:00.000Z",
    );
  });
});
