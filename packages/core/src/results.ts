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
  options: { id: string; label: string; score: number | null; isOther?: boolean | undefined }[];
}

export interface ResultsAnswer {
  responseId: string;
  questionId: string;
  optionId: string | null;
  text: string | null;
  /** Null for an anonymous Holler. */
  slackUserId: string | null;
}

/** A follow-up note or an Other write-in, beside a choice answer. */
export interface ResultsNote {
  responseId: string;
  questionId: string;
  kind: "note" | "other";
  text: string;
  /** Null for an anonymous Holler. */
  slackUserId: string | null;
}

/** A written answer: free text, a follow-up note or an Other write-in. */
export interface WrittenAnswer {
  text: string;
  /** Null for an anonymous Holler. */
  slackUserId: string | null;
}

export interface OptionResult {
  id: string;
  label: string;
  /** The Other option, whose write-ins are in `otherTexts`. */
  isOther: boolean;
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
      /** Follow-up notes, newest last. */
      notes: WrittenAnswer[];
      /** What people wrote beside Other. */
      otherTexts: WrittenAnswer[];
    }
  | {
      id: string;
      prompt: string;
      type: "text";
      style: QuestionStyle;
      answeredCount: number;
      texts: WrittenAnswer[];
    }
  | {
      id: string;
      prompt: string;
      type: "number";
      style: QuestionStyle;
      answeredCount: number;
      /** To one decimal. Null until someone answers. */
      average: number | null;
      median: number | null;
      min: number | null;
      max: number | null;
      values: { value: number; slackUserId: string | null }[];
    }
  | {
      id: string;
      prompt: string;
      type: "person";
      style: QuestionStyle;
      answeredCount: number;
      /** Everyone picked at least once, most picked first. */
      people: {
        slackUserId: string;
        name: string;
        count: number;
        /** Share of the people who answered this question, 0–1. */
        share: number;
        /** Who picked them. Empty for an anonymous Holler. */
        pickedBy: string[];
      }[];
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
  notes?: ResultsNote[] | undefined;
  /** Names of the people a person question picked, by Slack user id. */
  names?: ReadonlyMap<string, string> | undefined;
}): Results {
  const { anonymous, responseCount, questions, answers, notes = [], names } = input;
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
      const who = (a: { slackUserId: string | null }) => (anonymous ? null : a.slackUserId);
      if (question.type === "number") {
        const values = own.flatMap((a) => {
          const value = a.text == null ? Number.NaN : Number(a.text);
          return Number.isFinite(value) ? [{ value, slackUserId: who(a) }] : [];
        });
        const sorted = values.map((v) => v.value).sort((x, y) => x - y);
        const middle = Math.floor(sorted.length / 2);
        const oneDecimal = (n: number) => Math.round(n * 10) / 10;
        return {
          id: question.id,
          prompt: question.prompt,
          type: "number",
          style: question.style,
          answeredCount,
          average:
            sorted.length === 0
              ? null
              : oneDecimal(sorted.reduce((s, n) => s + n, 0) / sorted.length),
          median:
            sorted.length === 0
              ? null
              : sorted.length % 2 === 1
                ? (sorted[middle] as number)
                : oneDecimal(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2),
          min: sorted[0] ?? null,
          max: sorted.at(-1) ?? null,
          values,
        };
      }
      if (question.type === "person") {
        const picks = new Map<string, string[]>();
        for (const a of own) {
          if (!a.text) continue;
          const list = picks.get(a.text) ?? [];
          if (!anonymous && a.slackUserId) list.push(a.slackUserId);
          picks.set(a.text, list);
        }
        const counts = new Map<string, number>();
        for (const a of own) if (a.text) counts.set(a.text, (counts.get(a.text) ?? 0) + 1);
        return {
          id: question.id,
          prompt: question.prompt,
          type: "person",
          style: question.style,
          answeredCount,
          people: [...counts.entries()]
            .map(([slackUserId, n]) => ({
              slackUserId,
              name: names?.get(slackUserId) ?? slackUserId,
              count: n,
              share: answeredCount === 0 ? 0 : n / answeredCount,
              pickedBy: picks.get(slackUserId) ?? [],
            }))
            .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)),
        };
      }
      if (question.type === "text") {
        return {
          id: question.id,
          prompt: question.prompt,
          type: "text",
          style: question.style,
          answeredCount,
          texts: own.flatMap((a) =>
            a.text?.trim() ? [{ text: a.text, slackUserId: who(a) }] : [],
          ),
        };
      }
      const options = question.options.map((option): OptionResult => {
        const picked = own.filter((a) => a.optionId === option.id);
        return {
          id: option.id,
          label: option.label,
          isOther: option.isOther ?? false,
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
      const written = (kind: ResultsNote["kind"]) =>
        notes
          .filter((n) => n.questionId === question.id && n.kind === kind && n.text.trim())
          .map((n) => ({ text: n.text, slackUserId: who(n) }));
      return {
        id: question.id,
        prompt: question.prompt,
        type: question.type,
        style: question.style,
        answeredCount,
        options,
        average,
        notes: written("note"),
        otherTexts: written("other"),
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
