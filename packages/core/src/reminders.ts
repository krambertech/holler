import { instantOf, wallClockIn } from "./zones";

export const reminderTiers = [
  { tone: "gentle", afterHours: 24 },
  { tone: "nudge", afterHours: 72 },
  { tone: "last", afterHours: 120 },
] as const;

export type ReminderTone = (typeof reminderTiers)[number]["tone"];

const HOUR = 60 * 60 * 1000;
export const quietBeforeCloseHours = 2;
export const workdayStartHour = 9;
export const workdayEndHour = 18;

export interface ReminderState {
  invitedAt: Date;
  remindersSent: number;
  snoozedUntil: Date | null;
  closesAt: Date;
}

export function localHour(at: Date, timeZone: string | null): number {
  return wallClockIn(at, timeZone).hour;
}

export function nextReminder(
  state: ReminderState,
  timeZone: string | null,
  now: Date,
): { tone: ReminderTone; dueAt: Date } | null {
  const tier = reminderTiers[state.remindersSent];
  if (!tier) return null;
  let dueAt = new Date(state.invitedAt.getTime() + tier.afterHours * HOUR);
  if (state.snoozedUntil && state.snoozedUntil > dueAt) dueAt = state.snoozedUntil;
  if (dueAt < now) dueAt = now;
  for (let step = 0; step < 24; step++) {
    const hour = localHour(dueAt, timeZone);
    if (hour >= workdayStartHour && hour < workdayEndHour) break;
    dueAt = new Date(dueAt.getTime() + HOUR);
  }
  if (dueAt.getTime() > state.closesAt.getTime() - quietBeforeCloseHours * HOUR) return null;
  return { tone: tier.tone, dueAt };
}

export function snoozeTarget(now: Date, timeZone: string | null): Date {
  const wall = wallClockIn(now, timeZone);
  if (wall.hour < snoozeAfternoonHour) {
    return instantOf({ ...wall, hour: snoozeAfternoonHour, minute: 0 }, timeZone);
  }
  const tomorrow = wallClockIn(
    new Date(instantOf({ ...wall, hour: 12, minute: 0 }, timeZone).getTime() + 24 * HOUR),
    timeZone,
  );
  return instantOf({ ...tomorrow, hour: workdayStartHour, minute: 0 }, timeZone);
}

export const snoozeAfternoonHour = 15;
