/**
 * Dates in the shapes the design uses: "Fri 18:00" within the week, "Tomorrow", "30 Nov" after.
 * Always through Intl with the browser's locale, never hand-built strings.
 */
const DAY = 24 * 60 * 60 * 1000;

function startOfDay(at: Date) {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

export function closesLabel(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) {
    return `${new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(at)} ${time}`;
  }
  return shortDate(iso);
}

/** "30 Nov". */
export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(
    new Date(iso),
  );
}

/** "30 Nov, 14:05". */
export function dayAndTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** "1 December". Pass "UTC" when the date is a UTC boundary, such as the monthly reset. */
export function longDate(iso: string, timeZone?: string | undefined): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", timeZone }).format(
    new Date(iso),
  );
}

/** "November". */
export function monthName(at: Date, timeZone?: string | undefined): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", timeZone }).format(at);
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "today", "yesterday", "3 days ago", then "30 Nov". */
export function whenLabel(iso: string, now = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY);
  if (days >= 0 && days < 7) return relative.format(-days, "day");
  return shortDate(iso);
}

export function count(n: number): string {
  return new Intl.NumberFormat().format(n);
}

/** "No people", "1 person", "12 people". Both forms written out, never built from a ternary on 1. */
export function peopleLabel(n: number): string {
  if (n === 0) return "No people";
  if (n === 1) return "1 person";
  return `${count(n)} people`;
}

/** "1 question", "3 questions". */
export function questionsLabel(n: number): string {
  if (n === 1) return "1 question";
  return `${count(n)} questions`;
}

/** A share as a percentage in the reader's locale: 0.58 → "58%". */
export function percent(share: number): string {
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 }).format(
    share,
  );
}

/** "today at 14:00", "tomorrow at 09:00", "Tue at 10:00", then "30 Nov at 10:00". For a moment that matters to the minute. */
export function momentLabel(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days > 1 && days < 7) {
    return `${new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(at)} at ${time}`;
  }
  return `${shortDate(iso)} at ${time}`;
}
