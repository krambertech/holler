import { instantOf, wallClockIn } from "./zones";

export const repeatEvery = ["week", "fortnight"] as const;
export type RepeatEvery = (typeof repeatEvery)[number];

export const repeatDays: Record<RepeatEvery, number> = { week: 7, fortnight: 14 };

const DAY = 24 * 60 * 60 * 1000;

export function nextRoundAt(
  first: Date,
  every: RepeatEvery,
  timeZone: string | null | undefined,
  after: Date,
): Date {
  const wall = wallClockIn(first, timeZone);
  const step = repeatDays[every];
  const behind = Math.floor((after.getTime() - first.getTime()) / (step * DAY)) - 1;
  for (let round = Math.max(1, behind); ; round++) {
    const day = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + round * step));
    const at = instantOf(
      {
        year: day.getUTCFullYear(),
        month: day.getUTCMonth() + 1,
        day: day.getUTCDate(),
        hour: wall.hour,
        minute: wall.minute,
      },
      timeZone,
    );
    if (at.getTime() > after.getTime()) return at;
  }
}
