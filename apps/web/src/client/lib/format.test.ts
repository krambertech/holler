import { describe, expect, it } from "vitest";
import { closesIn, longDate } from "./format";

const now = new Date(2026, 10, 21, 20, 0);
const later = (ms: number) => new Date(now.getTime() + ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("closesIn", () => {
  it("counts minutes in the last hour, rounding up so it never says 0", () => {
    expect(closesIn(later(25 * MINUTE + 1), now)).toBe("Closes in 26 minutes");
    expect(closesIn(later(30_000), now)).toBe("Closes in 1 minute");
  });

  it("counts hours within a day", () => {
    expect(closesIn(later(5 * HOUR), now)).toBe("Closes in 5 hours");
    expect(closesIn(later(HOUR), now)).toBe("Closes in 1 hour");
  });

  it("names the day and time further out", () => {
    expect(closesIn(new Date(2026, 10, 23, 9, 30).toISOString(), now)).toBe(
      "Closes Monday at 09:30",
    );
    const later = new Date(2026, 11, 5, 18, 0).toISOString();
    expect(closesIn(later, now)).toBe(`Closes ${longDate(later)} at 18:00`);
  });

  it("says tomorrow for the next day once it is a day away", () => {
    expect(closesIn(new Date(2026, 10, 22, 21, 0).toISOString(), now)).toBe(
      "Closes tomorrow at 21:00",
    );
  });

  it("says it is closing once the time has passed", () => {
    expect(closesIn(later(-MINUTE), now)).toBe("Closing now");
  });
});
