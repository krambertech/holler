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
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(at);
}

export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(
    new Date(iso),
  );
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
