import type { QuestionStyle, QuestionType } from "./modes";

/**
 * An anonymous Holler's results open only once this many people answered, so no one person's
 * answer can be picked out. The web app, the API, MCP, exports and Slack all read this one number.
 */
export const anonymousThreshold = 5;

export interface ResultsQuestion {
  id: string;
  prompt: string;
  type: QuestionType;
  style: QuestionStyle;
  options: { id: string; label: string; score: number | null }[];
}

export interface ResultsAnswer {
  responseId: string;
  questionId: string;
  optionId: string | null;
  text: string | null;
  /** Null for an anonymous Holler. */
  slackUserId: string | null;
}

export interface OptionResult {
  id: string;
  label: string;
  count: number;
  /** Share of the people who answered this question, 0–1. */
  share: number;
  /** Who picked it. Empty for an anonymous Holler. */
  slackUserIds: string[];
}

export type QuestionResult =
  | {
      id: string;
      prompt: string;
      type: "single" | "multi";
      style: QuestionStyle;
      answeredCount: number;
      options: OptionResult[];
      /** The mean score on a scale question, to one decimal. Null when it is not a scale. */
      average: number | null;
    }
  | {
      id: string;
      prompt: string;
      type: "text";
      style: QuestionStyle;
      answeredCount: number;
      texts: { text: string; slackUserId: string | null }[];
    };

export type Results =
  | { state: "open"; responseCount: number; questions: QuestionResult[] }
  /** An anonymous Holler under the threshold: counts only, nothing per question. */
  | { state: "gated"; responseCount: number; needed: number };

export function summarize(input: {
  anonymous: boolean;
  responseCount: number;
  questions: ResultsQuestion[];
  answers: ResultsAnswer[];
}): Results {
  const { anonymous, responseCount, questions, answers } = input;
  if (anonymous && responseCount < anonymousThreshold) {
    return { state: "gated", responseCount, needed: anonymousThreshold - responseCount };
  }
  const byQuestion = new Map<string, ResultsAnswer[]>();
  for (const answer of answers) {
    const list = byQuestion.get(answer.questionId) ?? [];
    list.push(answer);
    byQuestion.set(answer.questionId, list);
  }
  return {
    state: "open",
    responseCount,
    questions: questions.map((question): QuestionResult => {
      const own = byQuestion.get(question.id) ?? [];
      const answeredCount = new Set(own.map((a) => a.responseId)).size;
      if (question.type === "text") {
        return {
          id: question.id,
          prompt: question.prompt,
          type: "text",
          style: question.style,
          answeredCount,
          texts: own.flatMap((a) =>
            a.text?.trim() ? [{ text: a.text, slackUserId: anonymous ? null : a.slackUserId }] : [],
          ),
        };
      }
      const options = question.options.map((option): OptionResult => {
        const picked = own.filter((a) => a.optionId === option.id);
        return {
          id: option.id,
          label: option.label,
          count: picked.length,
          share: answeredCount === 0 ? 0 : picked.length / answeredCount,
          slackUserIds: anonymous
            ? []
            : picked.flatMap((a) => (a.slackUserId ? [a.slackUserId] : [])),
        };
      });
      let average: number | null = null;
      if (question.style === "scale") {
        const scores = own.flatMap((a) => {
          const score = question.options.find((o) => o.id === a.optionId)?.score;
          return score == null ? [] : [score];
        });
        if (scores.length > 0) {
          average = Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10;
        }
      }
      return {
        id: question.id,
        prompt: question.prompt,
        type: question.type,
        style: question.style,
        answeredCount,
        options,
        average,
      };
    }),
  };
}

/** Rounds a time down to the hour, so an anonymous response's time cannot single anyone out. */
export function anonymousTime(at: Date): Date {
  const rounded = new Date(at);
  rounded.setUTCMinutes(0, 0, 0);
  return rounded;
}
