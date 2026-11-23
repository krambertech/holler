/** A time on a clock, with no day: 09:30 is `{ hour: 9, minute: 30 }`. */
export interface TimeOfDay {
  hour: number;
  minute: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "09:30", the way Holler prints a time everywhere else. */
export function timeKey({ hour, minute }: TimeOfDay): string {
  return `${pad(hour)}:${pad(minute)}`;
}

/** Every time in a day, `step` minutes apart, from 00:00. */
export function timeSlots(step = 15): TimeOfDay[] {
  const slots: TimeOfDay[] = [];
  for (let at = 0; at < 24 * 60; at += step) {
    slots.push({ hour: Math.floor(at / 60), minute: at % 60 });
  }
  return slots;
}

/**
 * What someone typed, read as a time: "9", "9:30", "9.30", "930", "0930", "21h", "9pm", "9:30 am".
 * Null when it is not a time on a clock.
 */
export function parseTimeOfDay(text: string): TimeOfDay | null {
  const typed = text.trim().toLocaleLowerCase().replace(/\s+/g, "");
  const match = /^(\d{1,4})(?:[:.h](\d{0,2}))?(am|pm|a|p)?$/.exec(typed);
  if (!match) return null;
  const [, lead = "", after, half] = match;
  let hour: number;
  let minute: number;
  if (after !== undefined) {
    if (lead.length > 2) return null;
    hour = Number(lead);
    minute = after === "" ? 0 : Number(after);
    if (after.length === 1) return null;
  } else if (lead.length <= 2) {
    hour = Number(lead);
    minute = 0;
  } else {
    // "930" and "0930": the last two digits are the minutes.
    hour = Number(lead.slice(0, -2));
    minute = Number(lead.slice(-2));
  }
  if (half) {
    if (hour < 1 || hour > 12) return null;
    if (half.startsWith("p") && hour !== 12) hour += 12;
    if (half.startsWith("a") && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * The times to offer for what was typed. Nothing typed offers the whole day. A typed time comes
 * first, even off the 15-minute steps, then the rest of its hour; "9" with no am or pm also offers
 * the evening's 21:00, since both are nine.
 */
export function timeOptions(query: string, step = 15): TimeOfDay[] {
  const slots = timeSlots(step);
  if (!query.trim()) return slots;
  const typed = parseTimeOfDay(query);
  if (!typed) return [];
  const halfGiven = /[ap]m?\s*$/i.test(query.trim());
  const hours = [typed.hour];
  if (!halfGiven && typed.hour >= 1 && typed.hour <= 11) hours.push(typed.hour + 12);
  const found = [typed];
  for (const hour of hours) {
    for (const slot of slots) {
      if (slot.hour !== hour) continue;
      if (hour === typed.hour && slot.minute < typed.minute) continue;
      if (slot.hour === typed.hour && slot.minute === typed.minute) continue;
      found.push(slot);
    }
  }
  return found;
}
