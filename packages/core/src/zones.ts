export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const MINUTE = 60 * 1000;

export const earliestZoneOffsetMinutes = 14 * 60;

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

export function offsetMinutes(at: Date, timeZone: string | null | undefined): number {
  const wall = wallClockIn(at, timeZone);
  return Math.round((asUtc(wall) - Math.floor(at.getTime() / MINUTE) * MINUTE) / MINUTE);
}

export function instantOf(wall: WallClock, timeZone: string | null | undefined): Date {
  const guess = asUtc(wall);
  const first = guess - offsetMinutes(new Date(guess), timeZone) * MINUTE;
  return new Date(guess - offsetMinutes(new Date(first), timeZone) * MINUTE);
}

export function sameWallClockIn(
  at: Date,
  fromZone: string | null | undefined,
  toZone: string | null | undefined,
): Date {
  return instantOf(wallClockIn(at, fromZone), toZone);
}

export function earliestInstantOf(at: Date, fromZone: string | null | undefined): Date {
  return new Date(asUtc(wallClockIn(at, fromZone)) - earliestZoneOffsetMinutes * MINUTE);
}
