/**
 * Wall-clock time in IANA time zones, with Intl only. A zone Intl does not know counts as UTC,
 * because a person with a broken zone should still get their Holler.
 */

export interface WallClock {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const MINUTE = 60 * 1000;

/** The furthest ahead of UTC any zone runs: Kiribati, UTC+14. */
export const earliestZoneOffsetMinutes = 14 * 60;

/** One formatter per zone: building an Intl.DateTimeFormat costs far more than using one. */
const clocks = new Map<string, Intl.DateTimeFormat>();

function clockIn(timeZone: string | null | undefined): Intl.DateTimeFormat {
  const zone = timeZone || "UTC";
  let clock = clocks.get(zone);
  if (!clock) {
    const options = {
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    } as const;
    try {
      clock = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: zone });
    } catch {
      clock = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" });
    }
    clocks.set(zone, clock);
  }
  return clock;
}

/** The wall-clock time at `at` in `timeZone`. */
export function wallClockIn(at: Date, timeZone: string | null | undefined): WallClock {
  const parts = clockIn(timeZone).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  };
}

function asUtc(wall: WallClock): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
}

/** How far `timeZone` is ahead of UTC at `at`, in minutes. */
export function offsetMinutes(at: Date, timeZone: string | null | undefined): number {
  const wall = wallClockIn(at, timeZone);
  return Math.round((asUtc(wall) - Math.floor(at.getTime() / MINUTE) * MINUTE) / MINUTE);
}

/**
 * The instant a wall-clock time happens in `timeZone`. Two passes settle the offset across a
 * daylight-saving change; a time that does not exist that night lands just after the jump.
 */
export function instantOf(wall: WallClock, timeZone: string | null | undefined): Date {
  const guess = asUtc(wall);
  const first = guess - offsetMinutes(new Date(guess), timeZone) * MINUTE;
  return new Date(guess - offsetMinutes(new Date(first), timeZone) * MINUTE);
}

/** The instant `at`'s wall-clock time in `fromZone` happens in `toZone`. */
export function sameWallClockIn(
  at: Date,
  fromZone: string | null | undefined,
  toZone: string | null | undefined,
): Date {
  return instantOf(wallClockIn(at, fromZone), toZone);
}

/** The first instant anyone on Earth reaches `at`'s wall-clock time in `fromZone`. */
export function earliestInstantOf(at: Date, fromZone: string | null | undefined): Date {
  return new Date(asUtc(wallClockIn(at, fromZone)) - earliestZoneOffsetMinutes * MINUTE);
}
