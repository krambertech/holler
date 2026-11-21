import {
  isChoice,
  numberedScale,
  type QuestionDraft,
  type QuestionInput,
  type QuestionTemplate,
  questionTemplates,
  scaleBounds,
  templateFor,
} from "@holler/core";

/*
 * The question list's rules, as pure functions over plain data, so the cards stay thin and every
 * rule has a test. A question in the editor is a `QuestionInput` with a key that stays the same
 * while it is edited and moved, for React and for reordering.
 */

export type EditorQuestion = QuestionInput & { key: string };

/** A question with every default filled in, which is what a card reads. */
export type FilledQuestion = QuestionDraft & { key: string };

export const newKey = () => crypto.randomUUID();

export function withKey(question: QuestionInput, key: string = newKey()): EditorQuestion {
  return { ...question, key };
}

export function filled(q: EditorQuestion): FilledQuestion {
  return {
    key: q.key,
    ...(q.id === undefined ? {} : { id: q.id }),
    type: q.type,
    style: q.style ?? "plain",
    prompt: q.prompt ?? "",
    description: q.description ?? "",
    required: q.required ?? true,
    options: q.options ?? [],
    allowOther: q.allowOther ?? false,
    maxChoices: q.maxChoices ?? null,
    followUp: q.followUp
      ? { prompt: q.followUp.prompt, onlyAfter: q.followUp.onlyAfter ?? null }
      : null,
    lowLabel: q.lowLabel ?? null,
    highLabel: q.highLabel ?? null,
    numberMin: q.numberMin ?? null,
    numberMax: q.numberMax ?? null,
  };
}

function template(id: string): QuestionTemplate {
  const found = questionTemplates.find((t) => t.id === id);
  if (!found) throw new Error(`No question template ${id}`);
  return found;
}

/** A plain choice question: options the sender writes, with Other and a pick limit to add. */
export const isPlainChoice = (q: { type: QuestionDraft["type"]; style: QuestionDraft["style"] }) =>
  isChoice(q.type) && q.style === "plain";

/** Two empty rows to write in: a choice question always has at least two options. */
const blankOptions = () => [{ label: "" }, { label: "" }];

function templateOptions(t: QuestionTemplate) {
  if (isChoice(t.type) && t.options.length === 0) return blankOptions();
  return t.options.map((o) => ({ ...o }));
}

/** A number question starts at "a whole number, 0 or more": counts are the usual answer. */
const startingBounds = (t: QuestionTemplate) =>
  t.type === "number" ? { numberMin: 0, numberMax: null } : { numberMin: null, numberMax: null };

/** A new question made from a question template, ready to write in. */
export function questionFromTemplate(id: string): EditorQuestion {
  const t = template(id);
  return {
    key: newKey(),
    type: t.type,
    style: t.style,
    prompt: "",
    description: "",
    required: true,
    options: templateOptions(t),
    allowOther: false,
    maxChoices: null,
    followUp: null,
    lowLabel: t.lowLabel ?? null,
    highLabel: t.highLabel ?? null,
    ...startingBounds(t),
  };
}

/**
 * Remakes a question as another type. The prompt, description and Required stay. Plain options stay
 * when moving between single and multiple choice; every extra the new type cannot have goes, by the
 * rules in `questionInputSchema`.
 */
export function changeTemplate(question: EditorQuestion, id: string): EditorQuestion {
  const q = filled(question);
  const t = template(id);
  if (templateFor(q).id === id) return question;
  const keepsOptions = isPlainChoice(q) && isChoice(t.type) && t.style === "plain";
  const options = keepsOptions ? q.options : templateOptions(t);
  const allowOther = keepsOptions && q.allowOther;
  const choices = options.length + (allowOther ? 1 : 0);
  const maxChoices =
    keepsOptions && t.type === "multi" && q.type === "multi" && q.maxChoices !== null
      ? Math.min(q.maxChoices, choices)
      : null;
  const followUp =
    q.followUp && isChoice(t.type)
      ? { prompt: q.followUp.prompt, onlyAfter: keepsOptions ? q.followUp.onlyAfter : null }
      : null;
  return {
    ...q,
    type: t.type,
    style: t.style,
    options,
    allowOther,
    maxChoices,
    followUp,
    lowLabel: t.lowLabel ?? null,
    highLabel: t.highLabel ?? null,
    ...startingBounds(t),
  };
}

/** A copy placed right after the original, as a new question with its own key. */
export function duplicateQuestion(question: EditorQuestion): EditorQuestion {
  const { id: _id, ...rest } = filled(question);
  return {
    ...rest,
    key: newKey(),
    options: rest.options.map(({ label, score }) => ({ label, score })),
  };
}

export function moveQuestion<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || from < 0 || from >= list.length) return next;
  const [moved] = next.splice(from, 1) as [T];
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/** Puts the keys in the order given, for a drag that ends; keys not in the order keep their place at the end. */
export function inOrder<T extends { key: string }>(
  list: readonly T[],
  keys: readonly string[],
): T[] {
  const byKey = new Map(list.map((q) => [q.key, q]));
  const ordered = keys.flatMap((key) => {
    const q = byKey.get(key);
    return q ? [q] : [];
  });
  return [...ordered, ...list.filter((q) => !keys.includes(q.key))];
}

/*
 * Options. A follow-up's `onlyAfter` names options by position, with Other one past the last, so
 * every change to the options moves those positions with them.
 */

const choiceCount = (q: FilledQuestion) => q.options.length + (q.allowOther ? 1 : 0);

function withPositions(q: FilledQuestion, shift: (at: number) => number | null): FilledQuestion {
  const onlyAfter = q.followUp?.onlyAfter;
  if (!q.followUp || !onlyAfter) return q;
  const moved = onlyAfter.flatMap((at) => {
    const next = shift(at);
    return next === null ? [] : [next];
  });
  return {
    ...q,
    followUp: { ...q.followUp, onlyAfter: moved.length > 0 ? moved : null },
  };
}

function clampPicks(q: FilledQuestion): FilledQuestion {
  if (q.type !== "multi" || q.maxChoices === null) return q;
  const most = choiceCount(q);
  return { ...q, maxChoices: most < 2 ? null : Math.min(q.maxChoices, most) };
}

/** Adds an empty option after `after` (at the end when left out). */
export function addOption(question: EditorQuestion, after?: number): EditorQuestion {
  const q = filled(question);
  const at = after === undefined ? q.options.length : after + 1;
  const options = [...q.options];
  options.splice(at, 0, { label: "" });
  return withPositions({ ...q, options }, (pos) => (pos >= at ? pos + 1 : pos));
}

/** Removes one option. A choice question keeps at least two, so this does nothing below three. */
export function removeOption(question: EditorQuestion, index: number): EditorQuestion {
  const q = filled(question);
  if (q.options.length <= 2) return question;
  const options = q.options.filter((_, i) => i !== index);
  const shifted = withPositions({ ...q, options }, (pos) =>
    pos === index ? null : pos > index ? pos - 1 : pos,
  );
  return clampPicks(shifted);
}

export function setOptionLabel(
  question: EditorQuestion,
  index: number,
  label: string,
): EditorQuestion {
  const q = filled(question);
  return { ...q, options: q.options.map((o, i) => (i === index ? { ...o, label } : o)) };
}

/** Adds or takes away the Other write-in. Only a plain choice question has one. */
export function setAllowOther(question: EditorQuestion, on: boolean): EditorQuestion {
  const q = filled(question);
  if (on && !isPlainChoice(q)) return question;
  if (on) return { ...q, allowOther: true };
  const other = q.options.length;
  return clampPicks(
    withPositions({ ...q, allowOther: false }, (pos) => (pos === other ? null : pos)),
  );
}

/*
 * Scales. A numbered scale is a run of whole numbers; any other scale (Agreement, Frequency) is
 * words, and shows as it is.
 */

export function scaleRange(question: EditorQuestion): { from: number; to: number } | null {
  const q = filled(question);
  if (q.style !== "scale" || q.options.length === 0) return null;
  if (!q.options.every((o) => /^\d+$/.test(o.label))) return null;
  return { from: Number(q.options[0]?.label), to: Number(q.options.at(-1)?.label) };
}

/** Remakes a custom scale's options from `from` (0 or 1) to `to` (2 to 10). */
export function setScaleRange(question: EditorQuestion, from: number, to: number): EditorQuestion {
  const q = filled(question);
  const low = (scaleBounds.lowest as readonly number[]).includes(from) ? from : 1;
  const high = Math.min(scaleBounds.highest.max, Math.max(scaleBounds.highest.min, to));
  const options = numberedScale(low, high);
  // A follow-up that named a step the scale no longer has falls back to after any answer.
  return withPositions({ ...q, options }, (pos) => (pos < options.length ? pos : null));
}

/** The highest steps a scale can end on, for the To control. */
export const scaleEnds = Array.from(
  { length: scaleBounds.highest.max - scaleBounds.highest.min + 1 },
  (_, i) => scaleBounds.highest.min + i,
);

/** The labels a follow-up can be shown after, in the positions `onlyAfter` uses. */
export function answerLabels(question: EditorQuestion, other: string): string[] {
  const q = filled(question);
  return [...q.options.map((o) => o.label), ...(q.allowOther ? [other] : [])];
}

/** The largest pick limit multiple choice can take: every option, Other included. */
export const mostPicks = (question: EditorQuestion) => choiceCount(filled(question));

/*
 * Problems. The shell passes send problems by path, "questions.1.prompt". The list pins each to
 * its question's key when they arrive, so a problem stays with its card when the cards move.
 */

/** The problems for each question, by key, with paths relative to the question: "prompt", "options.2". */
export type CardProblems = Record<string, string>;

export function problemsByKey(
  problems: Record<string, string> | undefined,
  questions: readonly { key: string }[],
): { list: string | undefined; byKey: Map<string, CardProblems> } {
  const byKey = new Map<string, CardProblems>();
  let list: string | undefined;
  for (const [path, message] of Object.entries(problems ?? {})) {
    if (path === "questions") {
      list = message;
      continue;
    }
    const match = /^questions\.(\d+)(?:\.(.+))?$/.exec(path);
    if (!match) continue;
    const key = questions[Number(match[1])]?.key;
    if (!key) continue;
    const card = byKey.get(key) ?? {};
    card[match[2] ?? ""] = message;
    byKey.set(key, card);
  }
  return { list, byKey };
}

/** The fields of a card from top to bottom, which is the order its problems are read in. */
const fieldOrder = [
  "type",
  "style",
  "prompt",
  "description",
  "options.",
  "options",
  "allowOther",
  "lowLabel",
  "highLabel",
  "followUp",
  "followUp.prompt",
  "numberMin",
  "numberMax",
  "maxChoices",
];

function rank(path: string): [number, number] {
  const option = /^options\.(\d+)$/.exec(path);
  if (option) return [fieldOrder.indexOf("options."), Number(option[1])];
  const at = fieldOrder.indexOf(path);
  return [at === -1 ? fieldOrder.length : at, 0];
}

/**
 * A card's problems in the order of its fields, each message once. `paths` are every field the
 * message belongs to, so each can point at the one sentence.
 */
export function orderProblems(problems: CardProblems): { message: string; paths: string[] }[] {
  const sorted = Object.entries(problems)
    .filter(([, message]) => message.trim() !== "")
    .map(([path, message], i) => {
      const [field, place] = rank(path);
      return { path, message, field, place, i };
    })
    .sort((a, b) => a.field - b.field || a.place - b.place || a.i - b.i);
  const byMessage = new Map<string, string[]>();
  for (const { path, message } of sorted) {
    byMessage.set(message, [...(byMessage.get(message) ?? []), path]);
  }
  return [...byMessage].map(([message, paths]) => ({ message, paths }));
}
