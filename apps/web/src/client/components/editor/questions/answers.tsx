import { Hash, Type, UserRound } from "lucide-react";
import { type FocusEvent, type Ref, useEffect, useRef, useState } from "react";
import { TriggerChevron } from "@/components/ui/overlay-list";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { type CardProblems, type EditorQuestion, filled, mostPicks } from "./model";
import {
  inlineControlClassName,
  ProblemMark,
  SettingLine,
  SettingPair,
  useProblemId,
  useReportProblems,
} from "./parts";

/*
 * What a card shows for questions without options to write: a quiet preview of the answer box
 * people get, and the settings that type has, each a short sentence at the card's foot.
 */

const previews = {
  text: { Icon: Type, words: "People write their answer" },
  person: { Icon: UserRound, words: "People pick from your workspace" },
  number: { Icon: Hash, words: "People answer with a number" },
};

interface PreviewProps {
  kind: keyof typeof previews;
}

/** A read-only stand-in for the box people answer in. */
function AnswerPreview({ kind }: PreviewProps) {
  const { Icon, words } = previews[kind];
  return (
    <div
      data-slot="answer-preview"
      className="flex min-h-10 items-center gap-2.5 rounded-control bg-well px-3 text-muted"
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2} />
      {words}
    </div>
  );
}

const ANY = "any";

const personItems = [
  { value: "1", label: "1 person" },
  { value: "2", label: "up to 2 people" },
  { value: "3", label: "up to 3 people" },
  { value: "5", label: "up to 5 people" },
  { value: "10", label: "up to 10 people" },
  { value: ANY, label: "any number" },
];

interface PickProps {
  question: EditorQuestion;
  onEdit: (next: EditorQuestion, fixes: string[]) => void;
  problems?: CardProblems | undefined;
}

/** "People can pick [up to 2]": how many people or options someone may pick. */
function PickLimit({ question, onEdit, problems = {} }: PickProps) {
  const q = filled(question);
  const problemId = useProblemId("maxChoices");
  const items =
    q.type === "person"
      ? personItems
      : [
          { value: ANY, label: "any number" },
          ...Array.from({ length: Math.max(0, mostPicks(question) - 1) }, (_, i) => ({
            value: String(i + 2),
            label: `up to ${i + 2}`,
          })),
        ];
  const value = q.maxChoices === null ? ANY : String(q.maxChoices);
  // A limit set elsewhere, such as over the API, still shows as it is.
  const shown = items.some((item) => item.value === value)
    ? items
    : [...items, { value, label: `up to ${value}` }];
  const invalid = Boolean(problems.maxChoices);
  return (
    <SettingLine data-slot="pick-limit">
      <span>People can pick</span>
      <Select
        value={value}
        items={shown}
        onValueChange={(next) =>
          next !== null &&
          onEdit({ ...q, maxChoices: next === ANY ? null : Number(next) }, ["maxChoices"])
        }
      >
        <SelectTrigger
          variant="chip"
          aria-label="How many people can pick"
          aria-invalid={invalid || undefined}
          aria-describedby={problemId}
          className={inlineControlClassName}
        >
          <SelectValue />
          {invalid && <ProblemMark />}
          <TriggerChevron />
        </SelectTrigger>
        <SelectContent aria-label="People can pick" />
      </Select>
    </SettingLine>
  );
}

const LIMIT = 1_000_000_000;

type Parsed = { ok: true; value: number | null } | { ok: false; message: string };

function parse(text: string): Parsed {
  const trimmed = text.trim().replace(/^−/, "-");
  if (trimmed === "") return { ok: true, value: null };
  if (!/^-?\d+$/.test(trimmed)) return { ok: false, message: "Use a whole number." };
  const value = Number(trimmed);
  if (Math.abs(value) > LIMIT) return { ok: false, message: "Use a number under a billion." };
  return { ok: true, value };
}

const shownNumber = (value: number | null) => (value === null ? "" : String(value));

interface BoundProps {
  inputRef?: Ref<HTMLInputElement> | undefined;
  label: string;
  value: string;
  problem: string | undefined;
  describedBy: string | undefined;
  onChange: (value: string) => void;
}

/** One bound's box. Its label wraps it, so a finger near the box still lands in it. */
function Bound({ inputRef, label, value, problem, describedBy, onChange }: BoundProps) {
  return (
    <label className="relative inline-flex pointer-coarse:before:absolute pointer-coarse:before:-inset-y-2 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']">
      <input
        ref={inputRef}
        aria-label={label}
        inputMode="numeric"
        value={value}
        placeholder="any"
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? describedBy : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          inlineControlClassName,
          "w-[4.5rem] pe-6 text-[1rem] tabular placeholder:text-muted focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 md:hoverable:text-sm",
        )}
      />
      {problem && <ProblemMark className="absolute end-1.5 top-1.5" />}
    </label>
  );
}

const numberFormat = new Intl.NumberFormat();

/** The rule in words, the way the card's foot states it. */
function ruleWords(min: number | null, max: number | null) {
  const n = (value: number) => numberFormat.format(value);
  if (min !== null && max !== null) return `A whole number from ${n(min)} to ${n(max)}`;
  if (min !== null) return `A whole number, ${n(min)} or more`;
  if (max !== null) return `A whole number, ${n(max)} or less`;
  return "Any whole number";
}

/** A quiet text button inside a settings sentence, with a finger-sized target. */
const linkButtonClassName =
  "relative rounded-xs text-ink-2 underline decoration-edge-3 underline-offset-4 transition-colors hoverable:hover:text-ink hoverable:hover:decoration-current pointer-coarse:before:absolute pointer-coarse:before:-inset-x-2 pointer-coarse:before:-inset-y-3 pointer-coarse:before:content-['']";

/**
 * The numbers a number question takes, said in words at the card's foot: "A whole number, 0 or
 * more". Change opens the same sentence with its two boxes, "from [ ] to [ ]"; an empty box is no
 * bound. What is typed stays in its box while it is not yet a number, and reaches the question once
 * it is one. The boxes stay open while what they hold has a problem.
 */
function NumberBounds({ question, onEdit, problems = {} }: PickProps) {
  const q = filled(question);
  const [text, setText] = useState({
    min: shownNumber(q.numberMin),
    max: shownNumber(q.numberMax),
  });
  const [seen, setSeen] = useState({ min: q.numberMin, max: q.numberMax });
  // A change from outside the boxes, such as an undo, replaces what they hold.
  if (seen.min !== q.numberMin || seen.max !== q.numberMax) {
    setSeen({ min: q.numberMin, max: q.numberMax });
    const min = parse(text.min);
    const max = parse(text.max);
    if (!(min.ok && min.value === q.numberMin && max.ok && max.value === q.numberMax)) {
      setText({ min: shownNumber(q.numberMin), max: shownNumber(q.numberMax) });
    }
  }
  const min = parse(text.min);
  const max = parse(text.max);
  const crossed =
    min.ok && max.ok && min.value !== null && max.value !== null && min.value > max.value;

  const update = (which: "min" | "max", value: string) => {
    const next = { ...text, [which]: value };
    setText(next);
    const low = parse(next.min);
    const high = parse(next.max);
    if (!low.ok || !high.ok) return;
    if (low.value !== null && high.value !== null && low.value > high.value) return;
    if (low.value === q.numberMin && high.value === q.numberMax) return;
    setSeen({ min: low.value, max: high.value });
    onEdit({ ...q, numberMin: low.value, numberMax: high.value }, ["numberMin", "numberMax"]);
  };

  // What is typed but not yet a number is this part's own problem; the card shows it at its foot.
  const own: CardProblems = {};
  if (!min.ok) own.numberMin = min.message;
  else if (crossed) own.numberMin = "The smallest number is more than the largest.";
  if (!max.ok) own.numberMax = max.message;
  useReportProblems("number-bounds", own);

  const minProblem = own.numberMin ?? problems.numberMin;
  const maxProblem = own.numberMax ?? problems.numberMax;
  const minId = useProblemId("numberMin");
  const maxId = useProblemId("numberMax");

  const [changing, setChanging] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const [focusFirst, setFocusFirst] = useState(false);
  useEffect(() => {
    if (focusFirst) first.current?.focus();
  }, [focusFirst]);
  const open = changing || Boolean(minProblem || maxProblem);

  if (!open) {
    return (
      <SettingLine data-slot="number-bounds">
        <span>{ruleWords(q.numberMin, q.numberMax)}</span>
        <button
          type="button"
          aria-label="Change the numbers people can give"
          className={linkButtonClassName}
          onClick={() => {
            setChanging(true);
            setFocusFirst(true);
          }}
        >
          Change
        </button>
      </SettingLine>
    );
  }

  // Once focus leaves the sentence and the boxes hold good numbers, it folds back into words.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setFocusFirst(false);
    setChanging(false);
  };
  return (
    <SettingLine data-slot="number-bounds" onBlur={onBlur}>
      <span>A whole number</span>
      <SettingPair>
        from
        <Bound
          inputRef={first}
          label="Smallest number"
          value={text.min}
          problem={minProblem}
          describedBy={minId}
          onChange={(value) => update("min", value)}
        />
      </SettingPair>
      <SettingPair>
        to
        <Bound
          label="Largest number"
          value={text.max}
          problem={maxProblem}
          describedBy={maxId}
          onChange={(value) => update("max", value)}
        />
      </SettingPair>
    </SettingLine>
  );
}

export { AnswerPreview, NumberBounds, PickLimit };
