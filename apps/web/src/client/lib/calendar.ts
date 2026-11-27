export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

export function dayOf(at: Date): CalendarDay {
  return { year: at.getFullYear(), month: at.getMonth(), day: at.getDate() };
}

export function dayKey({ year, month, day }: CalendarDay): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function compareDays(a: CalendarDay, b: CalendarDay): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function addDays(at: CalendarDay, days: number): CalendarDay {
  return dayOf(new Date(at.year, at.month, at.day + days));
}

export function addMonths(at: CalendarDay, months: number): CalendarDay {
  const first = new Date(at.year, at.month + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return { year: first.getFullYear(), month: first.getMonth(), day: Math.min(at.day, last) };
}

export interface CalendarCell extends CalendarDay {
  inMonth: boolean;
}

export function monthWeeks(year: number, month: number): CalendarCell[][] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const length = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((lead + length) / 7) * 7;
  const cells = Array.from({ length: total }, (_, i) => {
    const at = dayOf(new Date(year, month, 1 - lead + i));
    return { ...at, inMonth: at.month === month };
  });
  return Array.from({ length: total / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export function weekdayNames(locale?: string | undefined): { short: string; long: string }[] {
  const monday = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, i) => {
    const at = new Date(2024, 0, monday.getDate() + i);
    return {
      short: new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(at),
      long: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(at),
    };
  });
}

export function dayFromKey(
  key:
    | "ArrowLeft"
    | "ArrowRight"
    | "ArrowUp"
    | "ArrowDown"
    | "PageUp"
    | "PageDown"
    | "Home"
    | "End",
  at: CalendarDay,
  rtl = false,
): CalendarDay {
  const weekday = (new Date(at.year, at.month, at.day).getDay() + 6) % 7;
  switch (key) {
    case "ArrowLeft":
      return addDays(at, rtl ? 1 : -1);
    case "ArrowRight":
      return addDays(at, rtl ? -1 : 1);
    case "ArrowUp":
      return addDays(at, -7);
    case "ArrowDown":
      return addDays(at, 7);
    case "PageUp":
      return addMonths(at, -1);
    case "PageDown":
      return addMonths(at, 1);
    case "Home":
      return addDays(at, -weekday);
    case "End":
      return addDays(at, 6 - weekday);
  }
}
