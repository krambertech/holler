import { isChoice, type QuestionType } from "./modes";

/**
 * Whether one answer fits its question, as a pure function, so the web form can show every
 * problem at once before it sends and recordResponse refuses the same things with the same words.
 * The server alone checks what needs the database: that a person picked is in the workspace.
 */

/** What checking an answer needs to know about its question. */
export interface CheckedQuestion {
  type: QuestionType;
  required: boolean;
  maxChoices: number | null;
  numberMin: number | null;
  numberMax: number | null;
  /** Every option, the Other option included, with the position a follow-up names it by. */
  options: readonly { id: string; position: number; isOther: boolean }[];
  /** `onlyAfter` lists the option positions that show the note; null shows it after any answer. */
  followUp: { onlyAfter: readonly number[] | null } | null;
}

/** One answer, as `answerInputSchema` reads it. Missing fields are empty. */
export interface CheckedAnswer {
  optionIds?: readonly string[] | undefined;
  text?: string | null | undefined;
  number?: number | null | undefined;
  slackUserIds?: readonly string[] | undefined;
  otherText?: string | null | undefined;
  note?: string | null | undefined;
}

const count = new Intl.NumberFormat("en");

/**
 * True when picking `picked` asks for the question's follow-up note. A follow-up asks only once
 * something is picked; one with `onlyAfter` asks only after one of those options.
 */
export function noteAsked(question: CheckedQuestion, picked: readonly string[]): boolean {
  if (!question.followUp || picked.length === 0) return false;
  const shows = question.followUp.onlyAfter;
  if (shows === null) return true;
  return question.options.some((o) => picked.includes(o.id) && shows.includes(o.position));
}

/** The Other option of a choice question, if it has one. */
export function otherOption(question: CheckedQuestion) {
  return question.options.find((o) => o.isOther);
}

export function rangeMessage(min: number | null, max: number | null): string {
  if (min !== null && max !== null) {
    return `Enter a whole number from ${count.format(min)} to ${count.format(max)}.`;
  }
  if (min !== null) return `Enter a whole number of ${count.format(min)} or more.`;
  return `Enter a whole number of ${count.format(max ?? 0)} or less.`;
}

/** What is wrong with `answer`, written for the person answering, or null when it fits. */
export function answerProblem(
  question: CheckedQuestion,
  answer: CheckedAnswer | undefined,
): string | null {
  const needsAnswer = "This question needs an answer.";
  const note = answer?.note?.trim() || null;
  const otherText = answer?.otherText?.trim() || null;
  if (!isChoice(question.type)) {
    if (note) return "This question does not ask for a note.";
    if (otherText) return "This question has no Other option.";
  }

  if (question.type === "text") {
    const text = answer?.text?.trim() ?? "";
    return !text && question.required ? needsAnswer : null;
  }

  if (question.type === "number") {
    const value = answer?.number ?? null;
    if (value === null) return question.required ? needsAnswer : null;
    if (!Number.isInteger(value)) return "Enter a whole number.";
    const { numberMin: min, numberMax: max } = question;
    if ((min !== null && value < min) || (max !== null && value > max)) {
      return rangeMessage(min, max);
    }
    return null;
  }

  if (question.type === "person") {
    const picked = new Set(answer?.slackUserIds ?? []);
    if (picked.size === 0) return question.required ? needsAnswer : null;
    if (question.maxChoices !== null && picked.size > question.maxChoices) {
      return question.maxChoices === 1
        ? "Pick one person."
        : `Pick up to ${count.format(question.maxChoices)} people.`;
    }
    return null;
  }

  const picked = [...new Set(answer?.optionIds ?? [])];
  if (picked.some((id) => !question.options.some((o) => o.id === id))) {
    return "That choice is not one of this question's options.";
  }
  if (question.type === "single" && picked.length > 1) return "Pick one option.";
  if (question.maxChoices !== null && picked.length > question.maxChoices) {
    return question.maxChoices === 1
      ? "Pick one option."
      : `Pick up to ${count.format(question.maxChoices)} options.`;
  }
  if (picked.length === 0 && question.required) return needsAnswer;

  const other = otherOption(question);
  const pickedOther = other !== undefined && picked.includes(other.id);
  if (otherText && !pickedOther) {
    return "Pick Other to add your own answer, or clear what you wrote.";
  }
  if (pickedOther && !otherText) return "Write your answer beside Other.";

  if (note) {
    if (question.followUp === null) return "This question does not ask for a note.";
    if (picked.length === 0) return "Pick an answer before adding a note.";
    if (!noteAsked(question, picked)) {
      return "That answer does not ask for a note. Clear the note, or pick another answer.";
    }
  }
  return null;
}
