import type { Mode } from "@holler/core";

/**
 * What every Slack message about a Holler needs to know, loaded once by the delivery service.
 * Pure data, so the builders are pure functions with snapshot tests.
 */
export interface SlackHoller {
  id: string;
  mode: Mode;
  title: string;
  /** Markdown, as the editor stores it. */
  description: string;
  anonymous: boolean;
  externalUrl: string | null;
  /** Null until it is sent. */
  closesAt: Date | null;
  senderName: string;
  questions: SlackQuestion[];
}

export interface SlackQuestion {
  id: string;
  type: "single" | "multi" | "text";
  prompt: string;
  required: boolean;
  options: { id: string; label: string }[];
}

/** The ids Holler gives its buttons and modals, so /slack/interactions knows what was tapped. */
export const actionIds = {
  /** A one-tap answer. Suffixed with the option's position, because action ids must differ. */
  option: "holler_option",
  open: "holler_open",
  done: "holler_done",
  snooze: "holler_snooze",
  /** Link buttons. Slack still reports the tap; Holler ignores it. */
  formLink: "holler_form",
  resultsLink: "holler_results",
} as const;

export const answerViewId = "holler_answer";

/** How a recipient answers this Holler. docs/slack.md, Answering. */
export type AnswerKind = "one_tap" | "modal" | "chase";

/** Slack allows at most 10 radio buttons or checkboxes, and 100 options in a select. */
export const choiceLimit = 10;
export const oneTapLimit = 5;

export function answerKind(holler: Pick<SlackHoller, "mode" | "questions">): AnswerKind {
  if (holler.mode === "chase") return "chase";
  const [only, ...rest] = holler.questions;
  if (
    holler.mode === "pulse" &&
    only &&
    rest.length === 0 &&
    only.type === "single" &&
    only.options.length <= oneTapLimit
  ) {
    return "one_tap";
  }
  // A survey has at most 30 questions and a question at most 100 options, so it always fits a modal.
  return "modal";
}

/** Escapes the three characters Slack's mrkdwn treats as markup. */
export function escapeMrkdwn(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** The editor's Markdown as Slack mrkdwn: bold, italics, links and lists. */
export function mrkdwn(markdown: string): string {
  return escapeMrkdwn(markdown)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "<$2|$1>")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/__([^_]+)__/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/^\s*[-*]\s+/gm, "• ");
}

/** Slack refuses plain text past a field's limit, so long labels are cut with an ellipsis. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export const plain = (text: string, max = 75) => ({
  type: "plain_text" as const,
  text: clip(text, max),
  emoji: false,
});

/**
 * Long mrkdwn as as many sections as it needs, split at a line or a space, because one section
 * holds at most 3000 characters and a description can be 4000.
 */
export function sections(text: string) {
  const out: ReturnType<typeof section>[] = [];
  let rest = text;
  while (rest.length > 3000) {
    const window = rest.slice(0, 3000);
    const space = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
    // With no space to cut at, cut before the last escape, so &amp; never splits in two.
    const entity = window.lastIndexOf("&");
    const at = space > 0 ? space : entity > 2994 ? entity : 3000;
    out.push(section(rest.slice(0, at)));
    rest = rest.slice(at).trimStart();
  }
  if (rest) out.push(section(rest));
  return out;
}

/** One section. Text that can pass 3000 characters goes through `sections` instead. */
export const section = (text: string) => ({
  type: "section" as const,
  text: { type: "mrkdwn" as const, text },
});

/** A context line. A long text answer in a thank-you is cut short here on purpose. */
export const context = (text: string) => ({
  type: "context" as const,
  elements: [{ type: "mrkdwn" as const, text: clip(text, 3000) }],
});

const DAY = 24 * 60 * 60 * 1000;

/** "Friday at 18:00" within the coming week, "28 November at 18:00" past it, in their zone. */
export function when(at: Date, timeZone: string | null, now: Date): string {
  const zone = { timeZone: timeZone ?? "UTC" };
  const time = format(at, { ...zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const day =
    at.getTime() - now.getTime() < 6 * DAY
      ? format(at, { ...zone, weekday: "long" })
      : format(at, { ...zone, day: "numeric", month: "long" });
  return `${day} at ${time}`;
}

/** Just the time, "15:00", in their zone. */
export function timeOfDay(at: Date, timeZone: string | null): string {
  return format(at, {
    timeZone: timeZone ?? "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function format(at: Date, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("en-GB", options).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(at);
  }
}

const modeNames: Record<Mode, string> = {
  pulse: "Pulse",
  survey: "Survey",
  chase: "Form chase",
};

/** "Pulse · 2 questions · Closes Friday at 18:00 · Anonymous". */
export function contextLine(holler: SlackHoller, timeZone: string | null, now: Date): string {
  const parts = [modeNames[holler.mode]];
  const count = holler.questions.length;
  if (count === 1) parts.push("1 question");
  else if (count > 1) parts.push(`${count} questions`);
  if (holler.closesAt) parts.push(`Closes ${when(holler.closesAt, timeZone, now)}`);
  if (holler.anonymous) parts.push("Anonymous");
  return parts.join(" · ");
}
