import type { RespondPerson, RespondQuestion } from "@holler/core";
import type { DraftAnswer } from "@/lib/respond";

export interface ControlProps {
  question: RespondQuestion;
  value: DraftAnswer;
  onValueChange: (next: DraftAnswer) => void;
  legendId: string;
  searchPeople: (query: string) => Promise<RespondPerson[]>;
}

export const inlineOptions = 12;

export const numbered = (question: RespondQuestion) =>
  question.options.every((o) => /^\d+$/.test(o.label));

export function labelOf(question: RespondQuestion, index: number): string {
  const option = question.options[index];
  if (!option) return "";
  if (question.style !== "scale") return option.label;
  const last = question.options.length - 1;
  const word = index === 0 ? question.lowLabel : index === last ? question.highLabel : null;
  return word ? `${option.label}, ${word}` : option.label;
}

export const pickOne = (value: DraftAnswer, id: string | null): DraftAnswer => ({
  ...value,
  optionIds: id ? [id] : [],
});
