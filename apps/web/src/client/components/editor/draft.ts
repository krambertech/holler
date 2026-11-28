import type {
  HollerDraftInput,
  HollerOut,
  HollerTemplate,
  Mode,
  QuestionInput,
  RepeatEvery,
} from "@holler/core";
import { type EditorQuestion, withKey } from "./questions/model";

export interface EditorDraft {
  mode: Mode;
  title: string;
  description: string;
  externalUrl: string | null;
  anonymous: boolean;
  visibility: "private" | "workspace";
  tags: string[];
  audience: { people: string[]; groups: string[]; everyone: boolean };
  announceChannelId: string | null;
  sendAt: Date | null;
  sendInRecipientTimeZone: boolean;
  closesAt: Date | null;
  closeAfterHours: number;
  remindersEnabled: boolean;
  repeat: RepeatEvery | null;
  questions: EditorQuestion[];
}

export function blankDraft(mode: Mode): EditorDraft {
  return {
    mode,
    title: "",
    description: "",
    externalUrl: null,
    anonymous: false,
    visibility: "private",
    tags: [],
    audience: { people: [], groups: [], everyone: false },
    announceChannelId: null,
    sendAt: null,
    sendInRecipientTimeZone: false,
    closesAt: null,
    closeAfterHours: 72,
    remindersEnabled: true,
    repeat: null,
    questions: [],
  };
}

const copyQuestion = (q: QuestionInput): QuestionInput => ({
  ...q,
  options: (q.options ?? []).map((o) => ({ ...o })),
  ...(q.followUp ? { followUp: { ...q.followUp } } : {}),
});

export function draftFromTemplate(template: HollerTemplate): EditorDraft {
  return {
    ...blankDraft(template.mode),
    title: template.title,
    description: template.description,
    anonymous: template.anonymous,
    questions: template.questions.map((q) => withKey(copyQuestion(q))),
  };
}

export function applyTemplate(draft: EditorDraft, template: HollerTemplate): EditorDraft {
  const fresh = draftFromTemplate(template);
  return {
    ...draft,
    mode: fresh.mode,
    title: draft.title.trim() ? draft.title : fresh.title,
    description: draft.description.trim() ? draft.description : fresh.description,
    anonymous: draft.anonymous || fresh.anonymous,
    questions: fresh.questions,
  };
}

type QuestionOut = HollerOut["questions"][number];

function questionFromOut(q: QuestionOut): QuestionInput {
  return {
    id: q.id,
    type: q.type,
    style: q.style,
    prompt: q.prompt,
    description: q.description,
    required: q.required,
    options: q.options.map((o) => ({ id: o.id, label: o.label, score: o.score })),
    allowOther: q.allowOther,
    maxChoices: q.maxChoices,
    followUp: q.followUp,
    lowLabel: q.lowLabel,
    highLabel: q.highLabel,
    numberMin: q.numberMin,
    numberMax: q.numberMax,
  };
}

export function draftFromHoller(holler: HollerOut): EditorDraft {
  return {
    mode: holler.mode,
    title: holler.title,
    description: holler.description,
    externalUrl: holler.externalUrl,
    anonymous: holler.anonymous,
    visibility: holler.visibility,
    tags: holler.tags,
    audience: holler.audience,
    announceChannelId: holler.announceChannelId,
    sendAt: holler.sendAt ? new Date(holler.sendAt) : null,
    sendInRecipientTimeZone: holler.sendInRecipientTimeZone,
    closesAt: holler.closesAt ? new Date(holler.closesAt) : null,
    closeAfterHours: holler.closeAfterHours,
    remindersEnabled: holler.remindersEnabled,
    repeat: holler.repeat,
    questions: holler.questions.map((q) => withKey(questionFromOut(q))),
  };
}

export function toPayload(draft: EditorDraft): Required<HollerDraftInput> {
  return {
    mode: draft.mode,
    title: draft.title,
    description: draft.description,
    externalUrl: draft.externalUrl?.trim() ? draft.externalUrl.trim() : null,
    anonymous: draft.anonymous,
    visibility: draft.visibility,
    tags: draft.tags,
    audience: draft.audience,
    announceChannelId: draft.announceChannelId,
    sendAt: draft.sendAt,
    sendInRecipientTimeZone: draft.sendInRecipientTimeZone,
    closesAt: draft.closesAt,
    closeAfterHours: draft.closeAfterHours,
    remindersEnabled: draft.remindersEnabled,
    repeat: draft.repeat,
    questions:
      draft.mode === "chase" ? [] : draft.questions.map(({ key: _key, ...question }) => question),
  };
}

export function isBlank(draft: EditorDraft): boolean {
  if (draft.title.trim() || draft.description.trim() || draft.externalUrl?.trim()) return false;
  const { people, groups, everyone } = draft.audience;
  if (everyone || people.length > 0 || groups.length > 0) return false;
  return draft.questions.length === 0;
}

export function adoptIds(
  local: EditorQuestion[],
  sent: EditorQuestion[],
  saved: HollerOut["questions"],
): EditorQuestion[] {
  const byKey = new Map(sent.map((q, index) => [q.key, { q, out: saved[index] }]));
  return local.map((question) => {
    const match = byKey.get(question.key);
    if (!match?.out) return question;
    const { q: before, out } = match;
    let changed = false;
    const next: EditorQuestion = { ...question };
    if (question.id === undefined) {
      next.id = out.id;
      changed = true;
    }
    const sentOptions = before.options ?? [];
    const options = question.options ?? [];
    if (sentOptions.length === out.options.length && options.length >= sentOptions.length) {
      next.options = options.map((option, index) => {
        const savedOption = out.options[index];
        if (option.id !== undefined || index >= sentOptions.length || !savedOption) return option;
        changed = true;
        return { ...option, id: savedOption.id };
      });
    }
    return changed ? next : question;
  });
}

export function questionProblems(problems: readonly { message: string; field: string | null }[]) {
  const out: Record<string, string> = {};
  for (const p of problems) {
    if (p.field?.startsWith("questions.") && !(p.field in out)) out[p.field] = p.message;
  }
  return out;
}

export function problemFor(
  problems: readonly { message: string; field: string | null }[],
  field: string,
): string | undefined {
  return problems.find((p) => p.field === field)?.message;
}

const sendFields = new Set(["audience", "sendAt", "closesAt", "closeAfterHours"]);

export function composeProblems(problems: readonly { message: string; field: string | null }[]) {
  return problems.filter((p) => !(p.field && sendFields.has(p.field)));
}
