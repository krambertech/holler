import { instantOf, wallClockIn } from "./zones";

/**
 * The reminder rhythm, fixed for every Holler. A gentle reminder a day after the invite, a nudge
 * three days in, and a last one five days in, each only while the person is still waiting and
 * the Holler is still live. A reminder never lands in the last two hours before the close time,
 * because by then a reminder is noise, and never before 09:00 or after 18:00 in the person's
 * time zone; it waits for 09:00 instead.
 */
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

/** The local hour in an IANA time zone, falling back to UTC for an unknown zone. */
export function localHour(at: Date, timeZone: string | null): number {
  return wallClockIn(at, timeZone).hour;
}

/**
 * The next reminder a recipient is due, or null when they are due none. Pure, so the cron and
 * the detail page's "Next reminders go out…" line agree.
 */
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
  // Walk forward an hour at a time to the next working hour in their zone, at most a day.
  for (let step = 0; step < 24; step++) {
    const hour = localHour(dueAt, timeZone);
    if (hour >= workdayStartHour && hour < workdayEndHour) break;
    dueAt = new Date(dueAt.getTime() + HOUR);
  }
  if (dueAt.getTime() > state.closesAt.getTime() - quietBeforeCloseHours * HOUR) return null;
  return { tone: tier.tone, dueAt };
}

/**
 * Where "Remind me later" moves a person's next reminder: 15:00 today in their zone, or 09:00
 * tomorrow when it is already 15:00 or later.
 */
export function snoozeTarget(now: Date, timeZone: string | null): Date {
  const wall = wallClockIn(now, timeZone);
  if (wall.hour < snoozeAfternoonHour) {
    return instantOf({ ...wall, hour: snoozeAfternoonHour, minute: 0 }, timeZone);
  }
  // Noon today plus a day is always tomorrow, whatever daylight saving does tonight.
  const tomorrow = wallClockIn(
    new Date(instantOf({ ...wall, hour: 12, minute: 0 }, timeZone).getTime() + 24 * HOUR),
    timeZone,
  );
  return instantOf({ ...tomorrow, hour: workdayStartHour, minute: 0 }, timeZone);
}

export const snoozeAfternoonHour = 15;
