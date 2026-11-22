import { describe, expect, it } from "vitest";
import { nextRoundAt, repeatDays, repeatEvery } from "./repeats";
import { wallClockIn } from "./zones";

const zones = [
  "UTC",
  "Europe/Kyiv",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Asia/Kolkata",
  "Pacific/Auckland",
  "America/Sao_Paulo",
];

describe("nextRoundAt", () => {
  it("keeps every round on the first round's weekday and wall-clock time for a year, in every zone", () => {
    for (const zone of zones) {
      for (const every of repeatEvery) {
        for (const start of [
          "2026-01-05T07:00:00Z",
          "2026-03-27T16:30:00Z",
          "2026-10-23T22:15:00Z",
        ]) {
          const first = new Date(start);
          const wall = wallClockIn(first, zone);
          const weekday = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
          let at = first;
          for (let round = 1; round <= 60; round++) {
            const next = nextRoundAt(first, every, zone, at);
            const nextWall = wallClockIn(next, zone);
            const where = `${zone} ${every} from ${start}, round ${round}`;
            expect(next.getTime(), where).toBeGreaterThan(at.getTime());
            expect(
              new Date(Date.UTC(nextWall.year, nextWall.month - 1, nextWall.day)).getUTCDay(),
              where,
            ).toBe(weekday);
            expect([nextWall.hour, nextWall.minute], where).toEqual([wall.hour, wall.minute]);
            const days = Math.round(
              (Date.UTC(nextWall.year, nextWall.month - 1, nextWall.day) -
                Date.UTC(wall.year, wall.month - 1, wall.day)) /
                86_400_000,
            );
            expect(days, where).toBe(round * repeatDays[every]);
            at = next;
          }
        }
      }
    }
  });

  it("skips the rounds whose time already passed", () => {
    const first = new Date("2026-11-02T09:00:00Z");
    expect(nextRoundAt(first, "week", "UTC", new Date("2026-11-20T12:00:00Z"))).toEqual(
      new Date("2026-11-23T09:00:00Z"),
    );
    expect(nextRoundAt(first, "fortnight", "UTC", first)).toEqual(new Date("2026-11-16T09:00:00Z"));
  });
});
