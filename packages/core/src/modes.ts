export const modes = ["pulse", "survey", "chase"] as const;
export type Mode = (typeof modes)[number];

export const modeLabels: Record<Mode, string> = {
  pulse: "Pulse",
  survey: "Survey",
  chase: "Chase",
};

export const modeDescriptions: Record<Mode, string> = {
  pulse: "One or two quick questions. People answer with a tap, right in the DM.",
  survey: "Several questions, for a retro, a plan or a decision. Answered in a Slack form.",
  chase:
    "A form that lives somewhere else. Holler reminds people until they say they submitted it.",
};

export const questionLimits: Record<Mode, { min: number; max: number }> = {
  pulse: { min: 1, max: 2 },
  survey: { min: 1, max: 30 },
  chase: { min: 0, max: 0 },
};

export const questionTypes = ["single", "multi", "text", "number", "person"] as const;
export type QuestionType = (typeof questionTypes)[number];

export const questionStyles = ["plain", "scale", "binary"] as const;
export type QuestionStyle = (typeof questionStyles)[number];

export const choiceTypes: readonly QuestionType[] = ["single", "multi"];
export const isChoice = (type: QuestionType) => type === "single" || type === "multi";

export const otherLabel = "Other";

export const scaleBounds = { lowest: [0, 1], highest: { min: 2, max: 10 } } as const;

export interface TemplateOption {
  label: string;
  score?: number;
}

export interface QuestionTemplate {
  id: string;
  label: string;
  group: "choice" | "scale" | "write";
  type: QuestionType;
  style: QuestionStyle;
  options: TemplateOption[];
  lowLabel?: string;
  highLabel?: string;
  hint?: string;
}

export function numberedScale(from: number, to: number): TemplateOption[] {
  const options: TemplateOption[] = [];
  for (let n = from; n <= to; n++) options.push({ label: String(n), score: n });
  return options;
}

const scale = (labels: string[]): TemplateOption[] =>
  labels.map((label, index) => ({ label, score: index + 1 }));

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
    id: "satisfaction",
    label: "Satisfaction",
    hint: "Dissatisfied–satisfied",
    group: "scale",
    type: "single",
    style: "scale",
    options: scale(["Very dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very satisfied"]),
  },
  {
    id: "importance",
    label: "Importance",
    hint: "Not important–extremely important",
    group: "scale",
    type: "single",
    style: "scale",
    options: scale([
      "Not important",
      "Slightly important",
      "Moderately important",
      "Very important",
      "Extremely important",
    ]),
  },
  {
    id: "confidence",
    label: "Confidence",
    hint: "Not confident–extremely confident",
    group: "scale",
    type: "single",
    style: "scale",
    options: scale([
      "Not confident",
      "Slightly confident",
      "Somewhat confident",
      "Very confident",
      "Extremely confident",
    ]),
  },
  {
    id: "ease",
    label: "Ease",
    hint: "Very difficult–very easy",
    group: "scale",
    type: "single",
    style: "scale",
    options: scale(["Very difficult", "Difficult", "Neutral", "Easy", "Very easy"]),
  },
  {
    id: "quality",
    label: "Quality",
    hint: "Poor–excellent",
    group: "scale",
    type: "single",
    style: "scale",
    options: scale(["Poor", "Fair", "Good", "Very good", "Excellent"]),
  },
  {
    id: "recommend",
    label: "Recommend",
    hint: "0–10, as in eNPS",
    group: "scale",
    type: "single",
    style: "scale",
    options: numberedScale(0, 10),
    lowLabel: "Not at all likely",
    highLabel: "Extremely likely",
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

export function templateFor(question: {
  type: QuestionType;
  style: QuestionStyle;
  options: readonly { label: string }[];
  lowLabel?: string | null | undefined;
  highLabel?: string | null | undefined;
}): QuestionTemplate {
  const byId = (id: string) => questionTemplates.find((t) => t.id === id) as QuestionTemplate;
  if (question.type !== "single") return byId(question.type);
  if (question.style === "binary") return byId("binary");
  if (question.style !== "scale") return byId("single");
  const labels = question.options.map((o) => o.label).join("|");
  const ready = questionTemplates.find(
    (t) =>
      t.group === "scale" &&
      t.id !== "scale" &&
      t.options.map((o) => o.label).join("|") === labels &&
      (t.lowLabel ?? null) === (question.lowLabel ?? null) &&
      (t.highLabel ?? null) === (question.highLabel ?? null),
  );
  return ready ?? byId("scale");
}

export const slackLimits = {
  modalBlocks: 100,
  inlineOptions: 10,
  selectOptions: 100,
  dmButtons: 25,
} as const;
