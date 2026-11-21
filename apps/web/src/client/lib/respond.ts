import {
  answerProblem,
  isChoice,
  noteAsked,
  otherOption,
  type RespondPerson,
  type RespondQuestion,
  type ResponseInput,
} from "@holler/core";

/**
 * The web form's answers as the person types them, and how they become the response the server
 * takes. Pure, so the rules have tests: a note or an Other write-in that is no longer asked for is
 * never sent, and every problem is found at once with the server's own words (`answerProblem`).
 */

/** One question's answer in progress. Every field exists for every type; each type reads its own. */
export interface DraftAnswer {
  optionIds: string[];
  otherText: string;
  note: string;
  text: string;
  /** As typed, so "4." or "-" can sit in the box while someone types. */
  number: string;
  people: RespondPerson[];
}

export type Drafts = Record<string, DraftAnswer>;

export const emptyAnswer = (): DraftAnswer => ({
  optionIds: [],
  otherText: "",
  note: "",
  text: "",
  number: "",
  people: [],
});

export function draftOf(drafts: Drafts, questionId: string): DraftAnswer {
  return drafts[questionId] ?? emptyAnswer();
}

/** Whether the Other write-in shows: only while Other is picked. */
export function otherShown(question: RespondQuestion, draft: DraftAnswer): boolean {
  const other = otherOption(question);
  return other !== undefined && draft.optionIds.includes(other.id);
}

/** Whether the follow-up note shows, by the same rule the server keeps a note by. */
export function noteShown(question: RespondQuestion, draft: DraftAnswer): boolean {
  return noteAsked(question, draft.optionIds);
}

const wholeNumber = /^-?\d+$/;

type Answer = ResponseInput["answers"][number];

function answerFor(question: RespondQuestion, draft: DraftAnswer): Answer {
  const base = { questionId: question.id };
  if (isChoice(question.type)) {
    return {
      ...base,
      optionIds: draft.optionIds,
      // What was typed for an answer no longer picked stays on the page and is not sent.
      otherText: otherShown(question, draft) ? draft.otherText.trim() || null : null,
      note: noteShown(question, draft) ? draft.note.trim() || null : null,
    };
  }
  if (question.type === "text") return { ...base, text: draft.text.trim() || null };
  if (question.type === "number") {
    const typed = draft.number.trim();
    return { ...base, number: wholeNumber.test(typed) ? Number(typed) : null };
  }
  return { ...base, slackUserIds: draft.people.map((p) => p.slackUserId) };
}

/** The response `POST /api/respond/:id` takes. */
export function toResponse(questions: readonly RespondQuestion[], drafts: Drafts): ResponseInput {
  return { answers: questions.map((q) => answerFor(q, draftOf(drafts, q.id))) };
}

/** Every question's problem at once, by question id, in the words the server would use. */
export function problemsOf(
  questions: readonly RespondQuestion[],
  drafts: Drafts,
): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const question of questions) {
    const draft = draftOf(drafts, question.id);
    if (question.type === "number") {
      const typed = draft.number.trim();
      if (typed && !wholeNumber.test(typed)) {
        problems[question.id] = "Enter a whole number.";
        continue;
      }
    }
    const problem = answerProblem(question, answerFor(question, draft));
    if (problem) problems[question.id] = problem;
  }
  return problems;
}

/** Picks or unpicks an option, keeping one for single choice and the pick limit for multiple. */
export function toggleOption(
  question: RespondQuestion,
  draft: DraftAnswer,
  optionId: string,
  on: boolean,
): DraftAnswer {
  if (question.type === "single") return { ...draft, optionIds: on ? [optionId] : [] };
  const rest = draft.optionIds.filter((id) => id !== optionId);
  if (!on) return { ...draft, optionIds: rest };
  if (question.maxChoices !== null && rest.length >= question.maxChoices) return draft;
  // Kept in the question's order, whatever order they were ticked in.
  const picked = new Set([...rest, optionId]);
  return { ...draft, optionIds: question.options.filter((o) => picked.has(o.id)).map((o) => o.id) };
}

/** True once a multiple-choice question has as many picks as its limit allows. */
export function atPickLimit(question: RespondQuestion, draft: DraftAnswer): boolean {
  return question.maxChoices !== null && draft.optionIds.length >= question.maxChoices;
}
