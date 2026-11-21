import { Hash, Type, UserRound } from "lucide-react";
import { type Ref, useEffect, useRef, useState } from "react";
import { TriggerChevron } from "@/components/ui/overlay-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { type CardProblems, type EditorQuestion, filled, mostPicks } from "./model";
import {
  inlineControlClassName,
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

/** Picks a number the sender types, for a person question. */
const CUSTOM = "custom";

/** The most a pick limit can be, from `questionInputSchema`. */
const MOST = 100;

/**
 * "People can pick [up to 2]": how many people or options someone may pick. A person question can
 * also take a number of the sender's own: "People can pick [up to] [7]".
 */
function PickLimit({ question, onEdit, problems = {} }: PickProps) {
  const q = filled(question);
  const problemId = useProblemId("maxChoices");
  const person = q.type === "person";
  const presets = person
    ? [...personItems, { value: CUSTOM, label: "up to" }]
    : [
        { value: ANY, label: "any number" },
        ...Array.from({ length: Math.max(0, mostPicks(question) - 1) }, (_, i) => ({
          value: String(i + 2),
          label: `up to ${i + 2}`,
        })),
      ];
  const stored = q.maxChoices === null ? ANY : String(q.maxChoices);
  const isPreset = presets.some((item) => item.value === stored && item.value !== CUSTOM);
  const [ownNumber, setOwnNumber] = useState(person && !isPreset);
  const [text, setText] = useState(q.maxChoices === null || isPreset ? "" : String(q.maxChoices));
  const own = person && (ownNumber || !isPreset);
  // Picking Custom puts the cursor in the box, once the list has closed and handed focus back.
  const box = useRef<HTMLInputElement>(null);
  const [focusBox, setFocusBox] = useState(0);
  useEffect(() => {
    if (!focusBox) return;
    const frame = requestAnimationFrame(() => box.current?.select());
    return () => cancelAnimationFrame(frame);
  }, [focusBox]);
  const value = own ? CUSTOM : stored;
  // A limit set elsewhere, such as over the API, still shows as it is.
  const items =
    own || presets.some((item) => item.value === value)
      ? presets
      : [...presets, { value, label: `up to ${value}` }];

  const typed = text.trim() === "" ? null : Number(text.trim());
  const typedProblem =
    own && (typed === null || !Number.isInteger(typed) || typed < 1 || typed > MOST)
      ? `Use a whole number from 1 to ${MOST}.`
      : undefined;
  useReportProblems("pick-limit", typedProblem ? { maxChoices: typedProblem } : {});
  const invalid = Boolean(typedProblem ?? problems.maxChoices);

  return (
    <SettingLine data-slot="pick-limit">
      <span>People can pick</span>
      <Select
        value={value}
        items={items}
        onValueChange={(next) => {
          if (next === null) return;
          if (next === CUSTOM) {
            setOwnNumber(true);
            if (q.maxChoices !== null) setText(String(q.maxChoices));
            setFocusBox(Date.now());
            return;
          }
          setOwnNumber(false);
          onEdit({ ...q, maxChoices: next === ANY ? null : Number(next) }, ["maxChoices"]);
        }}
      >
        <SelectTrigger
          variant="chip"
          aria-label="How many people can pick"
          aria-invalid={(invalid && !own) || undefined}
          aria-describedby={own ? undefined : problemId}
          className={inlineControlClassName}
        >
          <SelectValue />
          <TriggerChevron />
        </SelectTrigger>
        <SelectContent aria-label="People can pick">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} indicator="end">
              {item.value === CUSTOM ? "Custom" : item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {own && (
        <Bound
          inputRef={box}
          aria-label="Most people someone can pick"
          value={text}
          placeholder="5"
          problem={typedProblem ?? problems.maxChoices}
          describedBy={problemId}
          onChange={(next) => {
            setText(next);
            const n = Number(next.trim());
            if (next.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= MOST) {
              onEdit({ ...q, maxChoices: n }, ["maxChoices"]);
            }
          }}
        />
      )}
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
  if (Math.abs(value) > LIMIT)
    return { ok: false, message: "Use a number no bigger than a billion." };
  return { ok: true, value };
}

const shownNumber = (value: number | null) => (value === null ? "" : String(value));

interface BoundProps {
  inputRef?: Ref<HTMLInputElement> | undefined;
  "aria-label": string;
  /** What an empty box means; "any" for a bound. */
  placeholder?: string | undefined;
  value: string;
  problem: string | undefined;
  describedBy: string | undefined;
  onChange: (value: string) => void;
}

/** One bound's box. Its label wraps it, so a finger near the box still lands in it. */
function Bound({
  inputRef,
  "aria-label": label,
  placeholder = "any",
  value,
  problem,
  describedBy,
  onChange,
}: BoundProps) {
  return (
    <label className="relative inline-flex pointer-coarse:before:absolute pointer-coarse:before:-inset-y-2 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']">
      <input
        ref={inputRef}
        aria-label={label}
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? describedBy : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          inlineControlClassName,
          "w-[4.5rem] pe-2 text-[1rem] tabular placeholder:text-muted focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 md:hoverable:text-sm",
        )}
      />
    </label>
  );
}

/**
 * "A whole number from [0] to [any]": the numbers a number question takes, a settings sentence like
 * every other at the card's foot. An empty box is no bound. What is typed stays in its box while it
 * is not yet a number, and reaches the question once it is one.
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
  else if (crossed) {
    // Crossed bounds are both at fault: the one message is said once, and both boxes are marked.
    own.numberMin = "The smallest number is more than the largest.";
    own.numberMax = own.numberMin;
  }
  if (!max.ok) own.numberMax = max.message;
  useReportProblems("number-bounds", own);

  const minProblem = own.numberMin ?? problems.numberMin;
  const maxProblem = own.numberMax ?? problems.numberMax;
  const minId = useProblemId("numberMin");
  const maxId = useProblemId("numberMax");

  return (
    <SettingLine data-slot="number-bounds">
      <span>A whole number</span>
      <SettingPair>
        from
        <Bound
          aria-label="Smallest number"
          value={text.min}
          problem={minProblem}
          describedBy={minId}
          onChange={(value) => update("min", value)}
        />
      </SettingPair>
      <SettingPair>
        to
        <Bound
          aria-label="Largest number"
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
