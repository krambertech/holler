import { isChoice, type Mode, type QuestionStyle, type QuestionType, slackLimits } from "./modes";

/**
 * Where a Holler is answered, so the editor can say so before it is sent and Slack delivery can
 * build the matching message. docs/slack.md, Answering.
 *
 * - `dm`: right in the DM. A pulse of one single-choice question shows its options as buttons,
 *   and the DM then offers an optional note. A pulse of one free-text question takes the answer
 *   in a box in the DM.
 * - `slack`: Answer opens a Slack form (a modal).
 * - `web`: Answer opens a web page, because something cannot be shown in Slack.
 * - `chase`: a chase has no questions; people open the form and press I submitted it.
 */
export type AnswerSurface =
  | { where: "dm" | "slack" | "chase" }
  | { where: "web"; question: number; why: "conditional_follow_up" | "too_many_options" }
  | { where: "web"; question: null; why: "too_long" };

export interface SurfaceQuestion {
  type: QuestionType;
  style: QuestionStyle;
  options: readonly unknown[];
  allowOther?: boolean | undefined;
  description?: string | undefined;
  followUp?: { onlyAfter: readonly number[] | null } | null | undefined;
}

export function answerSurface(holler: {
  mode: Mode;
  description?: string | undefined;
  questions: readonly SurfaceQuestion[];
}): AnswerSurface {
  if (holler.mode === "chase") return { where: "chase" };
  const { questions } = holler;

  for (const [index, q] of questions.entries()) {
    if (q.followUp?.onlyAfter && isChoice(q.type)) {
      return { where: "web", question: index, why: "conditional_follow_up" };
    }
    if (q.options.length + (q.allowOther ? 1 : 0) > slackLimits.selectOptions) {
      return { where: "web", question: index, why: "too_many_options" };
    }
  }

  // The intro is a section and a divider; each question is one input block, plus one for an
  // Other write-in and one for a follow-up note.
  const blocks =
    (holler.description?.trim() ? 2 : 0) +
    questions.reduce((n, q) => n + 1 + (q.allowOther ? 1 : 0) + (q.followUp ? 1 : 0), 0);
  if (blocks > slackLimits.modalBlocks) return { where: "web", question: null, why: "too_long" };

  const only = questions.length === 1 ? questions[0] : undefined;
  if (holler.mode === "pulse" && only) {
    if (only.type === "text") return { where: "dm" };
    if (
      only.type === "single" &&
      !only.allowOther &&
      only.options.length <= slackLimits.dmButtons
    ) {
      return { where: "dm" };
    }
  }
  return { where: "slack" };
}

/** A pulse needs no title: its first question stands in until the sender writes one. */
export function hollerTitle(holler: {
  mode: Mode;
  title: string;
  questions: readonly { prompt: string }[];
}): string {
  if (holler.title.trim()) return holler.title;
  if (holler.mode === "pulse") return holler.questions[0]?.prompt.trim() ?? "";
  return "";
}
