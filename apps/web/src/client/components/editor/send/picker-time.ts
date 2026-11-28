import { workdayStartHour } from "@holler/core";
import { atWallClock, wallClock } from "./send-logic";

export function tomorrowMorning(now: Date, zone: string): Date {
  const today = wallClock(now, zone);
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return atWallClock(
    {
      year: tomorrow.getUTCFullYear(),
      month: tomorrow.getUTCMonth() + 1,
      day: tomorrow.getUTCDate(),
      hour: workdayStartHour,
      minute: 0,
    },
    zone,
  );
}

export function nextWholeHour(at: Date, zone: string): Date {
  const next = atWallClock({ ...wallClock(at, zone), minute: 0 }, zone);
  return next.getTime() < at.getTime() ? new Date(next.getTime() + 3_600_000) : next;
}

export function toPicker(at: Date, zone: string): Date {
  const wall = wallClock(at, zone);
  return new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
}

export function fromPicker(picked: Date, zone: string): Date {
  return atWallClock(
    {
      year: picked.getFullYear(),
      month: picked.getMonth() + 1,
      day: picked.getDate(),
      hour: picked.getHours(),
      minute: picked.getMinutes(),
    },
    zone,
  );
}
