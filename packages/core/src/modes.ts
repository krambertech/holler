/** The three kinds of Holler. CONTEXT.md, Mode. */
export const modes = ["pulse", "survey", "chase"] as const;
export type Mode = (typeof modes)[number];

export const modeLabels: Record<Mode, string> = {
  pulse: "Pulse",
  survey: "Survey",
  chase: "Form chase",
};

/** A pulse is one or two quick questions; a survey has no fixed cap but Slack modals do. */
export const questionLimits: Record<Mode, { min: number; max: number }> = {
  pulse: { min: 1, max: 2 },
  survey: { min: 1, max: 30 },
  chase: { min: 0, max: 0 },
};

export const questionTypes = ["single", "multi", "text"] as const;
export type QuestionType = (typeof questionTypes)[number];

export const questionStyles = ["plain", "scale", "binary"] as const;
export type QuestionStyle = (typeof questionStyles)[number];

export interface TemplateOption {
  label: string;
  score?: number;
}

export interface QuestionTemplate {
  id: string;
  label: string;
  type: QuestionType;
  style: QuestionStyle;
  /** Preset options. Empty for free text and for choice questions the sender fills in. */
  options: TemplateOption[];
}

const scale = (labels: string[]): TemplateOption[] =>
  labels.map((label, index) => ({ label, score: index + 1 }));

/** How a question is made. Once made it is an ordinary question. CONTEXT.md, Question template. */
export const questionTemplates: QuestionTemplate[] = [
  { id: "single", label: "Single choice", type: "single", style: "plain", options: [] },
  { id: "multi", label: "Multiple choice", type: "multi", style: "plain", options: [] },
  { id: "text", label: "Free text", type: "text", style: "plain", options: [] },
  {
    id: "rating",
    label: "Rating 1–5",
    type: "single",
    style: "scale",
    options: scale(["1", "2", "3", "4", "5"]),
  },
  {
    id: "agreement",
    label: "Agreement scale",
    type: "single",
    style: "scale",
    options: scale(["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]),
  },
  {
    id: "frequency",
    label: "Frequency scale",
    type: "single",
    style: "scale",
    options: scale(["Never", "Rarely", "Sometimes", "Often", "Always"]),
  },
  {
    id: "binary",
    label: "Yes or no",
    type: "single",
    style: "binary",
    options: [{ label: "Yes" }, { label: "No" }],
  },
];

/**
 * Slack's limits that decide where a question can be answered. A modal holds 100 blocks;
 * radio buttons and checkboxes hold 10 options before a select menu has to take over, and a
 * select holds 100. A DM's actions block holds 25 buttons, and Holler answers one-tap only when
 * a pulse has one single-choice question of at most 5 options.
 */
export const slackLimits = {
  modalBlocks: 100,
  inlineOptions: 10,
  selectOptions: 100,
  oneTapOptions: 5,
} as const;
