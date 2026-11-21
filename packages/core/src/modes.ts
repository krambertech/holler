/** The three kinds of Holler. CONTEXT.md, Mode. */
export const modes = ["pulse", "survey", "chase"] as const;
export type Mode = (typeof modes)[number];

export const modeLabels: Record<Mode, string> = {
  pulse: "Pulse",
  survey: "Survey",
  chase: "Chase",
};

/** One line on what each mode is, for the start screen and the mode menu. */
export const modeDescriptions: Record<Mode, string> = {
  pulse: "One or two quick questions. People answer with a tap, right in the DM.",
  survey: "Several questions, for a retro, a plan or a decision. Answered in a Slack form.",
  chase:
    "A form that lives somewhere else. Holler reminds people until they say they submitted it.",
};

/** A pulse is one or two quick questions; a survey has no fixed cap but Slack modals do. */
export const questionLimits: Record<Mode, { min: number; max: number }> = {
  pulse: { min: 1, max: 2 },
  survey: { min: 1, max: 30 },
  chase: { min: 0, max: 0 },
};

/**
 * What kind of answer a question takes. `number` is a whole number; `person` is someone in the
 * workspace, picked from Slack's own people picker.
 */
export const questionTypes = ["single", "multi", "text", "number", "person"] as const;
export type QuestionType = (typeof questionTypes)[number];

/** How a single-choice question looks. Only single choice has a scale or a yes-or-no style. */
export const questionStyles = ["plain", "scale", "binary"] as const;
export type QuestionStyle = (typeof questionStyles)[number];

/** Question types whose answers are options. */
export const choiceTypes: readonly QuestionType[] = ["single", "multi"];
export const isChoice = (type: QuestionType) => type === "single" || type === "multi";

/** The label of the write-in option a choice question can add. */
export const otherLabel = "Other";

/** A scale runs from 0 or 1 to at most 10. */
export const scaleBounds = { lowest: [0, 1], highest: { min: 2, max: 10 } } as const;

export interface TemplateOption {
  label: string;
  score?: number;
}

export interface QuestionTemplate {
  id: string;
  label: string;
  /** Where the template sits in the Add question menu. */
  group: "choice" | "scale" | "write";
  type: QuestionType;
  style: QuestionStyle;
  /** Preset options. Empty for free text and for choice questions the sender fills in. */
  options: TemplateOption[];
  /** Words at each end of a numbered scale. */
  lowLabel?: string;
  highLabel?: string;
  /** Shown beside the label in the menu, such as the range. */
  hint?: string;
}

/** A numbered scale from `from` to `to`, each option scored by its number. */
export function numberedScale(from: number, to: number): TemplateOption[] {
  const options: TemplateOption[] = [];
  for (let n = from; n <= to; n++) options.push({ label: String(n), score: n });
  return options;
}

const scale = (labels: string[]): TemplateOption[] =>
  labels.map((label, index) => ({ label, score: index + 1 }));

/** How a question is made. Once made it is an ordinary question. CONTEXT.md, Question template. */
export const questionTemplates: QuestionTemplate[] = [
  {
    id: "single",
    label: "Single choice",
    group: "choice",
    type: "single",
    style: "plain",
    options: [],
  },
  {
    id: "multi",
    label: "Multiple choice",
    group: "choice",
    type: "multi",
    style: "plain",
    options: [],
  },
  {
    id: "binary",
    label: "Yes or no",
    group: "choice",
    type: "single",
    style: "binary",
    options: [{ label: "Yes" }, { label: "No" }],
  },
  { id: "person", label: "Person", group: "choice", type: "person", style: "plain", options: [] },
  {
    id: "rating",
    label: "Rating",
    hint: "1–5",
    group: "scale",
    type: "single",
    style: "scale",
    options: numberedScale(1, 5),
  },
  {
    id: "agreement",
    label: "Agreement",
    hint: "Disagree–agree",
    group: "scale",
    type: "single",
    style: "scale",
    options: scale(["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]),
  },
  {
    id: "frequency",
    label: "Frequency",
    hint: "Never–always",
    group: "scale",
    type: "single",
    style: "scale",
    options: scale(["Never", "Rarely", "Sometimes", "Often", "Always"]),
  },
  {
    id: "scale",
    label: "Custom scale",
    group: "scale",
    type: "single",
    style: "scale",
    options: numberedScale(1, 5),
    lowLabel: "",
    highLabel: "",
  },
  { id: "text", label: "Free text", group: "write", type: "text", style: "plain", options: [] },
  { id: "number", label: "Number", group: "write", type: "number", style: "plain", options: [] },
];

/** The template a stored question most looks like, for the type control's label. */
export function templateFor(question: {
  type: QuestionType;
  style: QuestionStyle;
  options: readonly { label: string }[];
  lowLabel?: string | null | undefined;
}): QuestionTemplate {
  const byId = (id: string) => questionTemplates.find((t) => t.id === id) as QuestionTemplate;
  if (question.type !== "single") return byId(question.type);
  if (question.style === "binary") return byId("binary");
  if (question.style !== "scale") return byId("single");
  const labels = question.options.map((o) => o.label).join("|");
  for (const id of ["agreement", "frequency"]) {
    if (
      labels ===
      byId(id)
        .options.map((o) => o.label)
        .join("|")
    )
      return byId(id);
  }
  if (labels === "1|2|3|4|5" && question.lowLabel == null) return byId("rating");
  return byId("scale");
}

/**
 * Slack's limits that decide where a question can be answered. A modal holds 100 blocks;
 * radio buttons and checkboxes hold 10 options before a select menu has to take over, and a
 * select holds 100. A DM's actions block holds 25 buttons, which is how many options a pulse
 * answered in the DM may have.
 */
export const slackLimits = {
  modalBlocks: 100,
  inlineOptions: 10,
  selectOptions: 100,
  dmButtons: 25,
} as const;
