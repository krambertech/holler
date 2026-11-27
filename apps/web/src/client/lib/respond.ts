import {
  answerProblem,
  isChoice,
  noteAsked,
  otherOption,
  type RespondPerson,
  type RespondQuestion,
  type ResponseInput,
} from "@holler/core";

export interface DraftAnswer {
  optionIds: string[];
  otherText: string;
  note: string;
  text: string;
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

export function otherShown(question: RespondQuestion, draft: DraftAnswer): boolean {
  const other = otherOption(question);
  return other !== undefined && draft.optionIds.includes(other.id);
}

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

export function toResponse(questions: readonly RespondQuestion[], drafts: Drafts): ResponseInput {
  return { answers: questions.map((q) => answerFor(q, draftOf(drafts, q.id))) };
}

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
  const picked = new Set([...rest, optionId]);
  return { ...draft, optionIds: question.options.filter((o) => picked.has(o.id)).map((o) => o.id) };
}

export function atPickLimit(question: RespondQuestion, draft: DraftAnswer): boolean {
  return question.maxChoices !== null && draft.optionIds.length >= question.maxChoices;
}

export function isAnswered(question: RespondQuestion, draft: DraftAnswer): boolean {
  if (isChoice(question.type)) return draft.optionIds.length > 0;
  if (question.type === "text") return draft.text.trim() !== "";
  if (question.type === "number") return draft.number.trim() !== "";
  return draft.people.length > 0;
}

export function answeredCount(questions: readonly RespondQuestion[], drafts: Drafts): number {
  return questions.filter((q) => isAnswered(q, draftOf(drafts, q.id))).length;
}
