import {
  type AnswerSurface,
  anonymousThreshold,
  type HollerDraft,
  quietBeforeCloseHours,
  reminderTiers,
  sameWallClockIn,
  workdayEndHour,
  workdayStartHour,
} from "@holler/core";
import { count, peopleLabel, questionsLabel } from "../../../lib/format";

/*
 * What the Send stage says, worked out from the draft. Pure, so every line a sender reads is
 * tested: the reach, when it lands in each time zone, when it closes, and the reminder rhythm.
 */

const HOUR = 60 * 60 * 1000;

/** The draft fields the Send stage edits. */
export type SendFields = Pick<
  HollerDraft,
  | "sendAt"
  | "sendInRecipientTimeZone"
  | "closesAt"
  | "closeAfterHours"
  | "anonymous"
  | "remindersEnabled"
  | "announceChannelId"
  | "tags"
>;

/** A line in a settings row: the fact, the words after it, and whether something is wrong. */
export interface RowSummary {
  value: string;
  description: string;
  tone?: "warning" | "danger" | undefined;
}

// ─── Time zones ──────────────────────────────────────────────────────────────────────────────

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function isTimeZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The time on the clocks in `zone` at the instant `at`. */
export function wallClock(at: Date, zone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function asUtc(wall: WallClock): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
}

/**
 * The instant the clocks in `zone` read `wall`. Corrected twice, so a wall time either side of a
 * daylight-saving change lands on the right hour; a time skipped by the change moves forward.
 */
export function atWallClock(wall: WallClock, zone: string): Date {
  const target = asUtc(wall);
  let at = target;
  for (let pass = 0; pass < 2; pass++) {
    const offset = asUtc(wallClock(new Date(at), zone)) - at;
    at = target - offset;
  }
  return new Date(at);
}

/** How far `zone`'s clocks are ahead of UTC at `at`, in milliseconds. */
function zoneOffset(at: Date, zone: string): number {
  return asUtc(wallClock(at, zone)) - Math.floor(at.getTime() / 60_000) * 60_000;
}

/** "Europe/Lisbon" → "Lisbon", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneName(zone: string): string {
  return (zone.split("/").pop() ?? zone).replaceAll("_", " ");
}

/** How many of the chosen people are in each time zone. Null is a person with none in Slack. */
export interface ZoneCount {
  zone: string | null;
  people: number;
}

export interface Landing {
  zone: string;
  people: number;
  /** The instant it reaches them. */
  at: Date;
  /** The sender's own zone. */
  yours: boolean;
  /** Your time: it lands before 09:00 or after 18:00 on their clock. */
  outsideWorkday: boolean;
  /** Each person's time: their moment has passed, so it reaches them as soon as it sends. */
  passed: boolean;
}

/**
 * When a scheduled Holler reaches each time zone. In your time everyone gets it at once; in each
 * person's time `sendAt` is read as a wall-clock time on the sender's clock, and each zone gets it
 * at that time on theirs. A person with no time zone in Slack counts as UTC, as delivery does.
 * Earliest first.
 */
export function landingTimes({
  sendAt,
  inRecipientTimeZone,
  senderZone,
  zones,
  now,
}: {
  sendAt: Date;
  inRecipientTimeZone: boolean;
  senderZone: string;
  zones: readonly ZoneCount[];
  now: Date;
}): Landing[] {
  const merged = new Map<string, number>();
  for (const { zone, people } of zones) {
    const key = isTimeZone(zone) ? zone : "UTC";
    merged.set(key, (merged.get(key) ?? 0) + people);
  }
  return (
    [...merged.entries()]
      .map(([zone, people]) => {
        // The same conversion delivery makes, so the preview and the send agree.
        const at = inRecipientTimeZone ? sameWallClockIn(sendAt, senderZone, zone) : sendAt;
        const hour = wallClock(at, zone).hour;
        return {
          zone,
          people,
          at,
          yours: zone === senderZone,
          outsideWorkday:
            !inRecipientTimeZone && (hour < workdayStartHour || hour >= workdayEndHour),
          passed: inRecipientTimeZone && at.getTime() <= now.getTime(),
        };
      })
      // Earliest first; at one moment, west to east, so the local times read in clock order.
      .sort(
        (a, b) =>
          a.at.getTime() - b.at.getTime() ||
          zoneOffset(a.at, a.zone) - zoneOffset(b.at, b.zone) ||
          a.zone.localeCompare(b.zone),
      )
  );
}

/** The first and last moment a send reaches someone. Sending now, both are now. */
export function sendWindow({
  sendAt,
  inRecipientTimeZone,
  senderZone,
  zones,
  now,
}: {
  sendAt: Date | null;
  inRecipientTimeZone: boolean;
  senderZone: string;
  zones: readonly ZoneCount[];
  now: Date;
}): { first: Date; last: Date } {
  if (!sendAt) return { first: now, last: now };
  if (!inRecipientTimeZone || zones.length === 0) return { first: sendAt, last: sendAt };
  const landings = landingTimes({ sendAt, inRecipientTimeZone, senderZone, zones, now });
  const times = landings.map((l) => Math.max(l.at.getTime(), now.getTime()));
  return { first: new Date(Math.min(...times)), last: new Date(Math.max(...times)) };
}

// ─── Words for dates ─────────────────────────────────────────────────────────────────────────

export interface FormatOptions {
  locale?: string | undefined;
  timeZone?: string | undefined;
}

/** "Mon 24 Nov, 17:00". */
export function dayTime(at: Date, { locale, timeZone }: FormatOptions = {}): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(at);
}

/** "17:00". */
export function clockTime(at: Date, { locale, timeZone }: FormatOptions = {}): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(at);
}

/** "Mon". */
export function weekday(at: Date, { locale, timeZone }: FormatOptions = {}): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone }).format(at);
}

// ─── Closing ─────────────────────────────────────────────────────────────────────────────────

/** The close times the row offers. Any other `closeAfterHours`, from the API, still reads well. */
export const closePresets = [
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
] as const;

/** "1 day", "3 days", "1 week", "2 weeks", "12 hours". */
export function durationLabel(hours: number): string {
  if (hours % 168 === 0) {
    const weeks = hours / 168;
    return weeks === 1 ? "1 week" : `${count(weeks)} weeks`;
  }
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "1 day" : `${count(days)} days`;
  }
  return hours === 1 ? "1 hour" : `${count(hours)} hours`;
}

/** When it closes: the fixed time, or `closeAfterHours` after the last person gets it. */
export function closeTime(
  fields: Pick<SendFields, "closesAt" | "closeAfterHours">,
  window: { last: Date },
): Date {
  return fields.closesAt ?? new Date(window.last.getTime() + fields.closeAfterHours * HOUR);
}

// ─── Row summaries ───────────────────────────────────────────────────────────────────────────

interface SummaryContext {
  now: Date;
  senderZone: string;
  zones: readonly ZoneCount[];
  locale?: string | undefined;
}

export function sendSummary(
  fields: Pick<SendFields, "sendAt" | "sendInRecipientTimeZone">,
  { now, senderZone, zones, locale }: SummaryContext,
  problem?: string | undefined,
): RowSummary {
  const { sendAt } = fields;
  if (!sendAt) {
    return problem
      ? { value: "Now", description: problem, tone: "danger" }
      : { value: "Now", description: "when you press Send" };
  }
  const value = dayTime(sendAt, { locale, timeZone: senderZone });
  if (problem) return { value, description: problem, tone: "danger" };
  if (!fields.sendInRecipientTimeZone) {
    if (sendAt.getTime() <= now.getTime()) {
      return { value, description: "That time has passed. Pick a later one.", tone: "danger" };
    }
    return { value, description: "your time" };
  }
  const window = sendWindow({ sendAt, inRecipientTimeZone: true, senderZone, zones, now });
  const all = landingTimes({ sendAt, inRecipientTimeZone: true, senderZone, zones, now });
  if (all.length > 0 && all.every((l) => l.passed)) {
    return {
      value,
      description: "That time has passed everywhere. Pick a later one.",
      tone: "danger",
    };
  }
  if (window.first.getTime() === window.last.getTime()) {
    return { value, description: "each person's own time" };
  }
  const first = clockTime(window.first, { locale, timeZone: senderZone });
  const last = clockTime(window.last, { locale, timeZone: senderZone });
  const lastDay =
    weekday(window.first, { locale, timeZone: senderZone }) ===
    weekday(window.last, { locale, timeZone: senderZone })
      ? last
      : `${weekday(window.last, { locale, timeZone: senderZone })} ${last}`;
  return { value, description: `each person's own time, from ${first} to ${lastDay} yours` };
}

export function closeSummary(
  fields: Pick<SendFields, "sendAt" | "sendInRecipientTimeZone" | "closesAt" | "closeAfterHours">,
  { now, senderZone, zones, locale }: SummaryContext,
  problem?: string | undefined,
): RowSummary {
  const window = sendWindow({
    sendAt: fields.sendAt,
    inRecipientTimeZone: fields.sendInRecipientTimeZone,
    senderZone,
    zones,
    now,
  });
  const closes = closeTime(fields, window);
  const value = dayTime(closes, { locale, timeZone: senderZone });
  if (problem) return { value, description: problem, tone: "danger" };
  if (fields.closesAt) {
    if (closes.getTime() <= now.getTime()) {
      return { value, description: "That time has passed. Pick a later one.", tone: "danger" };
    }
    if (closes.getTime() <= window.last.getTime()) {
      const description =
        window.first.getTime() === window.last.getTime()
          ? "That is before it sends. Pick a later time."
          : "That is before it reaches everyone. Pick a later time.";
      return { value, description, tone: "danger" };
    }
    if (closes.getTime() - window.last.getTime() < HOUR) {
      return { value, description: "That leaves less than an hour to answer.", tone: "warning" };
    }
    return { value, description: "on the date you picked" };
  }
  const after = durationLabel(fields.closeAfterHours);
  if (window.first.getTime() !== window.last.getTime()) {
    return { value, description: `${after} after the last person gets it` };
  }
  return { value, description: `${after} after it sends` };
}

export function answersSummary(anonymous: boolean): RowSummary {
  return anonymous
    ? { value: "Anonymous", description: "you see how many answered, never who" }
    : { value: "Named", description: "you see who said what" };
}

/**
 * Said under Answers when an anonymous Holler reaches fewer people than it needs before its
 * results open. Nothing when nobody is chosen yet: the audience says so itself.
 */
export function anonymousWarning(anonymous: boolean, reach: Reach): string | null {
  if (
    !anonymous ||
    reach.everyone ||
    reach.unknown ||
    reach.count === 0 ||
    reach.count >= anonymousThreshold
  ) {
    return null;
  }
  if (reach.count === 1) {
    return `Results open at ${anonymousThreshold} answers, and only 1 person gets this. Add people or make it named.`;
  }
  return `Results open at ${anonymousThreshold} answers, and only ${count(reach.count)} people get this. Add people or make it named.`;
}

/**
 * The reminders that fit before it closes. A reminder never lands in the last two hours, so a
 * Holler open for a day gets none. Working hours can move one a little later; this counts the
 * rhythm, which is what the sender chooses.
 */
export function remindersBeforeClose(openHours: number): number {
  return reminderTiers.filter((tier) => tier.afterHours <= openHours - quietBeforeCloseHours)
    .length;
}

export function remindersSummary(enabled: boolean, openHours: number): RowSummary {
  if (!enabled) return { value: "Off", description: "nobody gets a reminder" };
  switch (remindersBeforeClose(openHours)) {
    case 0:
      return { value: "On", description: "it closes before the first one is due" };
    case 1:
      return { value: "On", description: "a day in, to anyone still waiting" };
    case 2:
      return { value: "On", description: "a day in and three days in, to anyone still waiting" };
    default:
      return {
        value: "On",
        description: "a day, three days and five days in, to anyone still waiting",
      };
  }
}

/** How long it stays open, in hours, for the reminder rhythm. */
export function openHours(
  fields: Pick<SendFields, "sendAt" | "sendInRecipientTimeZone" | "closesAt" | "closeAfterHours">,
  context: SummaryContext,
): number {
  const window = sendWindow({
    sendAt: fields.sendAt,
    inRecipientTimeZone: fields.sendInRecipientTimeZone,
    senderZone: context.senderZone,
    zones: context.zones,
    now: context.now,
  });
  return (closeTime(fields, window).getTime() - window.first.getTime()) / HOUR;
}

// ─── Reach ───────────────────────────────────────────────────────────────────────────────────

/** About how many people an audience reaches. */
export interface Reach {
  count: number;
  /** False when groups may overlap or a size is unknown, so the count is a ceiling. */
  exact: boolean;
  everyone: boolean;
  /** True when a chosen group's size is not known, so the count says nothing about the reach. */
  unknown: boolean;
}

export function audienceReach(
  audience: { people: readonly string[]; groups: readonly string[]; everyone: boolean },
  sizeOf: (groupId: string) => number | null | undefined,
  workspaceSize: number | null | undefined,
): Reach {
  if (audience.everyone) {
    return {
      count: workspaceSize ?? 0,
      exact: workspaceSize != null,
      everyone: true,
      unknown: workspaceSize == null,
    };
  }
  const sizes = audience.groups.map((id) => sizeOf(id));
  const inGroups = sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0);
  return {
    count: audience.people.length + inGroups,
    exact: audience.groups.length === 0,
    everyone: false,
    unknown: sizes.some((size) => size == null),
  };
}

/** "14 people", "About 40 people"; everyone reads as the workspace's size when it is known. */
export function reachLabel(reach: Reach): string {
  if (reach.everyone) return reach.exact ? peopleLabel(reach.count) : "Everyone in the workspace";
  if (reach.unknown) return "Size not known yet";
  if (reach.count === 0) return "Nobody yet";
  if (!reach.exact) {
    return reach.count === 1 ? "About 1 person" : `About ${count(reach.count)} people`;
  }
  return peopleLabel(reach.count);
}

/**
 * Sending to everyone or to more than 50 people asks once more. DECISIONS.md, Sending. A group of
 * unknown size could be any size, so it asks too.
 */
export const bigSendAbove = 50;

export function isBigSend(reach: Reach): boolean {
  return reach.everyone || reach.unknown || reach.count > bigSendAbove;
}

/** The plum button names the reach: "Send to 14 people", "Schedule for everyone". */
export function sendActionLabel(reach: Reach, scheduled: boolean): string {
  if (reach.everyone) return scheduled ? "Schedule for everyone" : "Send to everyone";
  if (reach.count === 0 || reach.unknown) return scheduled ? "Schedule" : "Send";
  if (reach.count === 1) return scheduled ? "Schedule for 1 person" : "Send to 1 person";
  const n = count(reach.count);
  return scheduled ? `Schedule for ${n} people` : `Send to ${n} people`;
}

// ─── The bar ─────────────────────────────────────────────────────────────────────────────────

export function answeredInLabel(surface: AnswerSurface): string {
  switch (surface.where) {
    case "dm":
      return "Answered right in the DM";
    case "slack":
      return "Answered in a Slack form";
    case "web":
      return "Answered on a web page";
    case "chase":
      return "Answered in your form";
  }
}

/** Why a Holler goes to the web page, in a sentence the sender can act on. */
export function webReason(surface: AnswerSurface): string | null {
  if (surface.where !== "web") return null;
  if (surface.why === "too_long") return "It has more than a Slack form can hold.";
  const n = surface.question + 1;
  if (surface.why === "conditional_follow_up") {
    return `Question ${count(n)} shows its note only after some answers, which a Slack form cannot do.`;
  }
  return `Question ${count(n)} has more options than a Slack form can show.`;
}

/** The bar on Compose: where it is answered and how many questions, or the one thing to fix. */
export function composeBarSummary(
  surface: AnswerSurface,
  questionCount: number,
  problem?: string | undefined,
): { title: string; description: string | null; tone?: "danger" | undefined } {
  if (problem) return { title: problem, description: null, tone: "danger" };
  if (surface.where === "chase") return { title: answeredInLabel(surface), description: null };
  return {
    title: answeredInLabel(surface),
    description: questionCount === 0 ? "No questions yet" : questionsLabel(questionCount),
  };
}

/** The bar on Send: "14 people, now" over "Closes Mon 24 Nov, 17:00". */
export function sendBarSummary(
  reach: Reach,
  fields: Pick<SendFields, "sendAt" | "sendInRecipientTimeZone" | "closesAt" | "closeAfterHours">,
  context: SummaryContext,
): { title: string; description: string } {
  const { now, senderZone, zones, locale } = context;
  const window = sendWindow({
    sendAt: fields.sendAt,
    inRecipientTimeZone: fields.sendInRecipientTimeZone,
    senderZone,
    zones,
    now,
  });
  const closes = dayTime(closeTime(fields, window), { locale, timeZone: senderZone });
  const who = reach.everyone ? "Everyone" : reachLabel(reach);
  const when = fields.sendAt ? dayTime(fields.sendAt, { locale, timeZone: senderZone }) : "now";
  return { title: `${who}, ${when}`, description: `Closes ${closes}` };
}
