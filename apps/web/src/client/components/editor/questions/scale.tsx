import { scaleBounds } from "@holler/core";
import { TriggerChevron } from "@/components/ui/overlay-list";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import {
  type CardProblems,
  type EditorQuestion,
  filled,
  scaleEnds,
  scaleRange,
  setScaleRange,
} from "./model";
import {
  inlineControlClassName,
  ProblemMark,
  previewChipClassName,
  SettingLine,
  SettingPair,
  useProblemId,
} from "./parts";

const fromItems = scaleBounds.lowest.map((n) => ({ value: String(n), label: String(n) }));
const toItems = scaleEnds.map((n) => ({ value: String(n), label: String(n) }));

interface Props {
  question: EditorQuestion;
  number: number;
  /** A custom scale lets the sender write the words at each end; its range is set at the foot. */
  custom: boolean;
  onEdit: (next: EditorQuestion, fixes: string[]) => void;
  problems?: CardProblems | undefined;
}

/** A word at one end of the scale, written right under its number, the way people will read it. */
const endWords =
  "w-full min-w-0 rounded-sm bg-transparent px-1 py-0.5 text-sm text-ink-2 outline-none transition-[background-color,box-shadow] placeholder:text-muted hoverable:hover:bg-hover focus-visible:bg-hover aria-invalid:edge-danger";

interface EndProps {
  label: string;
  value: string;
  placeholder: string;
  end: "low" | "high";
  problem: string | undefined;
  onChange: (value: string) => void;
}

function EndWords({ label, value, placeholder, end, problem, onChange }: EndProps) {
  const path = end === "low" ? "lowLabel" : "highLabel";
  const problemId = useProblemId(path);
  return (
    <span className="relative min-w-0 flex-1">
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        maxLength={60}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? problemId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          endWords,
          end === "high" && "text-end",
          problem && (end === "high" ? "ps-6" : "pe-6"),
        )}
      />
      {problem && (
        <ProblemMark
          className={cn("absolute top-1/2 -translate-y-1/2", end === "high" ? "start-1" : "end-1")}
        />
      )}
    </span>
  );
}

/**
 * A scale's steps as people will see them: quiet chips, because the type sets them and nobody edits
 * them here. A preset scale (Rating, Agreement, Frequency) says so under them. A custom scale has the
 * words at each end written under its first and last number.
 */
function ScaleOptions({ question, number, custom, onEdit, problems = {} }: Props) {
  const q = filled(question);
  const range = scaleRange(question);
  const numbered = range !== null;
  const editable = custom && range;
  return (
    <div data-slot="scale-options" className="flex w-fit max-w-full flex-col gap-1.5">
      <ol
        aria-label={`Scale for question ${number}`}
        className={cn("flex flex-wrap", numbered ? "gap-1" : "gap-1.5")}
      >
        {q.options.map((option) => (
          <li
            key={option.label}
            className={cn(
              previewChipClassName,
              "justify-center",
              // A numbered scale stays one row on a phone, the way people will see it.
              numbered && "min-w-8 px-1 tabular max-sm:min-w-0 max-sm:flex-1",
            )}
          >
            {option.label}
          </li>
        ))}
      </ol>
      {editable ? (
        <div className="flex gap-4">
          <EndWords
            label={`Words at ${range.from}`}
            value={q.lowLabel ?? ""}
            placeholder="Add words for this end"
            end="low"
            problem={problems.lowLabel}
            onChange={(value) => onEdit({ ...q, lowLabel: value }, ["lowLabel"])}
          />
          <EndWords
            label={`Words at ${range.to}`}
            value={q.highLabel ?? ""}
            placeholder="and this end"
            end="high"
            problem={problems.highLabel}
            onChange={(value) => onEdit({ ...q, highLabel: value }, ["highLabel"])}
          />
        </div>
      ) : (
        <p className="text-muted text-sm">
          Set by the type. Pick Custom scale to change the steps.
        </p>
      )}
    </div>
  );
}

interface RangeProps {
  value: number;
  items: { value: string; label: string }[];
  label: string;
  onChange: (next: number) => void;
}

function RangeSelect({ value, items, label, onChange }: RangeProps) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => v !== null && onChange(Number(v))}
      items={items}
    >
      <SelectTrigger
        variant="chip"
        aria-label={label}
        className={cn(inlineControlClassName, "tabular")}
      >
        <SelectValue />
        <TriggerChevron />
      </SelectTrigger>
      <SelectContent aria-label={label} />
    </Select>
  );
}

interface ScaleRangeProps {
  question: EditorQuestion;
  onEdit: (next: EditorQuestion, fixes: string[]) => void;
}

/** "Scale from [1] to [5]": a custom scale's range, at the card's foot. */
function ScaleRange({ question, onEdit }: ScaleRangeProps) {
  const range = scaleRange(question);
  if (!range) return null;
  return (
    <SettingLine data-slot="scale-range">
      <span>Scale</span>
      <SettingPair>
        from
        <RangeSelect
          value={range.from}
          items={fromItems}
          label="Lowest number"
          onChange={(from) => onEdit(setScaleRange(question, from, range.to), ["options*"])}
        />
      </SettingPair>
      <SettingPair>
        to
        <RangeSelect
          value={range.to}
          items={toItems}
          label="Highest number"
          onChange={(to) => onEdit(setScaleRange(question, range.from, to), ["options*"])}
        />
      </SettingPair>
    </SettingLine>
  );
}

export { ScaleOptions, ScaleRange };
