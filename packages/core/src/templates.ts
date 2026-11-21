import { type Mode, numberedScale, questionTemplates } from "./modes";
import type { QuestionInput } from "./types";

/**
 * Templates: ready hollers to start from. Picking one opens the editor filled in; from then on it
 * is an ordinary draft. CONTEXT.md, Template. Not the same as a question template, which is how
 * one question is made.
 */
export const templateGroups = [
  { id: "check-ins", label: "Check-ins" },
  { id: "team-health", label: "Team health" },
  { id: "planning", label: "Planning" },
  { id: "recognition", label: "Recognition" },
  { id: "chases", label: "Forms to chase" },
] as const;
export type TemplateGroup = (typeof templateGroups)[number]["id"];

export interface HollerTemplate {
  id: string;
  group: TemplateGroup;
  name: string;
  /** One line for the picker. */
  summary: string;
  mode: Mode;
  title: string;
  description: string;
  anonymous: boolean;
  questions: QuestionInput[];
}

const options = (...labels: string[]) => labels.map((label) => ({ label }));
const preset = (id: string) => {
  const t = questionTemplates.find((q) => q.id === id);
  if (!t) throw new Error(`No question template ${id}`);
  return { type: t.type, style: t.style, options: t.options.map((o) => ({ ...o })) };
};

export const hollerTemplates: HollerTemplate[] = [
  {
    id: "weekly-pulse",
    group: "check-ins",
    name: "Weekly pulse",
    summary: "How was your week? With an optional note.",
    mode: "pulse",
    title: "",
    description: "",
    anonymous: false,
    questions: [
      {
        type: "single",
        prompt: "How was your week?",
        options: options("Great", "Fine", "Rough"),
        followUp: { prompt: "Anything to add?", onlyAfter: null },
      },
    ],
  },
  {
    id: "monday-focus",
    group: "check-ins",
    name: "Monday focus",
    summary: "What is your one focus this week?",
    mode: "pulse",
    title: "",
    description: "",
    anonymous: false,
    questions: [{ type: "text", prompt: "What is your one focus this week?" }],
  },
  {
    id: "workload",
    group: "check-ins",
    name: "Workload check",
    summary: "How is your workload, from too light to too heavy?",
    mode: "pulse",
    title: "",
    description: "",
    anonymous: true,
    questions: [
      {
        type: "single",
        style: "scale",
        prompt: "How is your workload right now?",
        options: numberedScale(1, 5),
        lowLabel: "Too light",
        highLabel: "Too heavy",
        followUp: { prompt: "What would help?", onlyAfter: null },
      },
    ],
  },
  {
    id: "friday-wins",
    group: "check-ins",
    name: "Friday wins",
    summary: "A win, a blocker, and one thing you learned.",
    mode: "survey",
    title: "Friday wins",
    description: "Three quick ones to close the week.",
    anonymous: false,
    questions: [
      { type: "text", prompt: "What went well this week?" },
      { type: "text", prompt: "What got in your way?", required: false },
      { type: "text", prompt: "One thing you learned", required: false },
    ],
  },
  {
    id: "enps",
    group: "team-health",
    name: "eNPS",
    summary: "How likely are you to recommend working here? 0 to 10.",
    mode: "pulse",
    title: "",
    description: "",
    anonymous: true,
    questions: [
      {
        type: "single",
        style: "scale",
        prompt: "How likely are you to recommend working here to a friend?",
        options: numberedScale(0, 10),
        lowLabel: "Not at all likely",
        highLabel: "Extremely likely",
        followUp: { prompt: "What is the main reason for your score?", onlyAfter: null },
      },
    ],
  },
  {
    id: "team-health",
    group: "team-health",
    name: "Team health check",
    summary: "Five statements on how the team is doing.",
    mode: "survey",
    title: "Team health check",
    description: "Answers are anonymous. Results open once five people answer.",
    anonymous: true,
    questions: [
      "I know what is expected of me",
      "I can raise a concern without worrying about it",
      "We ship things we are proud of",
      "My workload is sustainable",
      "I would recommend this team to a friend",
    ].map((prompt) => ({ ...preset("agreement"), prompt })),
  },
  {
    id: "manager-feedback",
    group: "team-health",
    name: "Manager feedback",
    summary: "What to keep, start and stop, anonymously.",
    mode: "survey",
    title: "Feedback for your manager",
    description: "Anonymous. Your manager sees the answers once five people reply.",
    anonymous: true,
    questions: [
      { ...preset("rating"), prompt: "How supported do you feel?" },
      { type: "text", prompt: "What should I keep doing?" },
      { type: "text", prompt: "What should I start or stop doing?" },
    ],
  },
  {
    id: "retro",
    group: "planning",
    name: "Retro",
    summary: "What went well, what didn't, what should we change?",
    mode: "survey",
    title: "Retro",
    description: "",
    anonymous: false,
    questions: [
      { type: "text", prompt: "What went well?" },
      { type: "text", prompt: "What didn't go well?" },
      { type: "text", prompt: "What should we change next time?" },
    ],
  },
  {
    id: "prioritise",
    group: "planning",
    name: "Prioritise",
    summary: "Pick up to three from a list.",
    mode: "survey",
    title: "What should we do first?",
    description: "",
    anonymous: false,
    questions: [
      {
        type: "multi",
        prompt: "Which of these should we do first?",
        description: "Pick up to three.",
        options: options("", "", "", ""),
        maxChoices: 3,
        allowOther: true,
      },
    ],
  },
  {
    id: "offsite-dates",
    group: "planning",
    name: "Offsite dates",
    summary: "Which dates work for you?",
    mode: "survey",
    title: "Offsite: which dates work?",
    description: "",
    anonymous: false,
    questions: [
      {
        type: "multi",
        prompt: "Which of these dates work for you?",
        description: "Tick every one that works.",
        options: options("", "", ""),
      },
      { type: "text", prompt: "Anything we should know?", required: false },
    ],
  },
  {
    id: "kudos",
    group: "recognition",
    name: "Kudos",
    summary: "Who helped you most this month, and how?",
    mode: "pulse",
    title: "",
    description: "",
    anonymous: false,
    questions: [
      { type: "person", prompt: "Who helped you most this month?", maxChoices: 1 },
      { type: "text", prompt: "What did they do?", required: false },
    ],
  },
  {
    id: "expense-report",
    group: "chases",
    name: "Expense report",
    summary: "Chase everyone until their expenses are in.",
    mode: "chase",
    title: "Submit your expenses",
    description: "Add this month's expenses before the end of the month.",
    anonymous: false,
    questions: [],
  },
  {
    id: "benefits",
    group: "chases",
    name: "Benefits sign-up",
    summary: "Make sure everyone picks their benefits.",
    mode: "chase",
    title: "Pick your benefits",
    description: "Sign-up closes soon. It takes about five minutes.",
    anonymous: false,
    questions: [],
  },
];
