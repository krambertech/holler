import { scaleBounds } from "@holler/core";
import {
  Award,
  Feather,
  Flag,
  Gauge,
  HeartHandshake,
  type LucideIcon,
  Repeat,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Star,
  ThumbsUp,
} from "lucide-react";
import { TriggerChevron } from "@/components/ui/overlay-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";
import {
  type CardProblems,
  changeTemplate,
  type EditorQuestion,
  filled,
  scaleEnds,
  scaleRange,
  setScaleRange,
} from "./model";
import {
  inlineControlClassName,
  previewChipClassName,
  SettingLine,
  SettingPair,
  useProblemId,
} from "./parts";
import { scaleTemplates, typeChipClassName } from "./question-types";

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
  "w-full min-w-0 rounded-sm bg-transparent px-1 py-0.5 text-[1rem] text-ink-2 transition-[background-color,box-shadow] focus-visible:outline-offset-1 md:hoverable:text-sm placeholder:text-muted hoverable:hover:bg-hover focus-visible:bg-hover aria-invalid:bg-danger aria-invalid:edge-danger";

interface EndProps {
  "aria-label": string;
  value: string;
  placeholder: string;
  end: "low" | "high";
  problem: string | undefined;
  onChange: (value: string) => void;
}

function EndWords({ "aria-label": label, value, placeholder, end, problem, onChange }: EndProps) {
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
        className={cn(endWords, end === "high" && "text-end")}
      />
    </span>
  );
}

/**
 * A scale's steps as people will see them: quiet chips, because the type sets them and nobody edits
 * them here. A custom scale has the words at each end written under its first and last number.
 */
function ScaleOptions({ question, number, custom, onEdit, problems = {} }: Props) {
  const q = filled(question);
  const range = scaleRange(question);
  const numbered = range !== null;
  const editable = custom && range;
  return (
    <div data-slot="scale-options" className="flex w-fit max-w-full flex-col gap-1.5 max-sm:w-full">
      <ol
        aria-label={`Scale for question ${number}`}
        className={cn(
          "flex flex-wrap",
          numbered ? "gap-1" : "gap-1.5",
          // A short custom scale still leaves room for its end words: its steps widen to fill it.
          editable && "sm:min-w-80",
        )}
      >
        {q.options.map((option, at) => (
          <li
            // oxlint-disable-next-line react/no-array-index-key -- steps are fixed by the type and can repeat a word
            key={at}
            className={cn(
              previewChipClassName,
              "justify-center",
              // A numbered scale stays one row on a phone, the way people will see it.
              numbered && "min-w-8 px-1 tabular max-sm:min-w-0 max-sm:flex-1",
              editable && "sm:flex-1",
            )}
          >
            {option.label}
          </li>
        ))}
      </ol>
      {editable && (
        // As wide as the steps above, never wider: the words sit under the first and last step.
        <div className="flex w-0 min-w-full gap-4">
          <EndWords
            aria-label={`Words at ${range.from}`}
            value={q.lowLabel ?? ""}
            placeholder="Add words for this end"
            end="low"
            problem={problems.lowLabel}
            onChange={(value) => onEdit({ ...q, lowLabel: value }, ["lowLabel"])}
          />
          <EndWords
            aria-label={`Words at ${range.to}`}
            value={q.highLabel ?? ""}
            placeholder="and this end"
            end="high"
            problem={problems.highLabel}
            onChange={(value) => onEdit({ ...q, highLabel: value }, ["highLabel"])}
          />
        </div>
      )}
      {!editable && (q.lowLabel || q.highLabel) && (
        // A ready scale's end words come with it: shown as they are, like its steps.
        <div className="flex w-0 min-w-full justify-between gap-4 px-1 text-muted text-sm">
          <span>{q.lowLabel}</span>
          <span className="text-end">{q.highLabel}</span>
        </div>
      )}
    </div>
  );
}

interface RangeProps {
  value: number;
  items: { value: string; label: string }[];
  "aria-label": string;
  onChange: (next: number) => void;
}

function RangeSelect({ value, items, "aria-label": label, onChange }: RangeProps) {
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
      <SelectContent aria-label={label}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} indicator="end">
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Each scale's icon; a scale added later without one shows the gauge. */
const scaleIcons: Record<string, LucideIcon> = {
  rating: Star,
  agreement: ThumbsUp,
  frequency: Repeat,
  satisfaction: Smile,
  importance: Flag,
  confidence: ShieldCheck,
  ease: Feather,
  quality: Award,
  recommend: HeartHandshake,
  scale: SlidersHorizontal,
};

const kindItems = scaleTemplates.map((t) => ({
  value: t.id,
  label: t.id === "scale" ? "Custom" : t.label,
}));

function ScaleIcon({ id }: { id: string }) {
  const Icon = scaleIcons[id] ?? Gauge;
  return <Icon aria-hidden className="size-4 shrink-0 text-ink-2" strokeWidth={2} />;
}

interface KindProps {
  question: EditorQuestion;
  /** The template the question looks like now, from `templateFor`. */
  templateId: string;
  number: number;
  onEdit: (next: EditorQuestion, fixes: string[]) => void;
}

/** Which scale a Scale question uses, beside its type in the card's head. Rating is where it starts. */
function ScaleKindSelect({ question, templateId, number, onEdit }: KindProps) {
  return (
    <Select
      value={templateId}
      items={kindItems}
      onValueChange={(next) => {
        if (next && next !== templateId) onEdit(changeTemplate(question, next), ["*"]);
      }}
    >
      <SelectTrigger
        variant="chip"
        aria-label={`Scale of question ${number}`}
        className={typeChipClassName}
      >
        <ScaleIcon id={templateId} />
        {/* Sized to its words, shrinking only when the head has no room left. */}
        <SelectValue className="min-w-0 flex-initial truncate" />
        <TriggerChevron />
      </SelectTrigger>
      <SelectContent aria-label="Scale">
        {kindItems.map((item) => (
          <SelectItem key={item.value} value={item.value} indicator="end">
            <span className="flex min-w-0 items-center gap-2.5">
              <ScaleIcon id={item.value} />
              <span className="truncate">{item.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface RangeLineProps {
  question: EditorQuestion;
  onEdit: (next: EditorQuestion, fixes: string[]) => void;
}

/** "Scale from [1] to [5]": a custom scale's range, at the card's foot. */
function ScaleRange({ question, onEdit }: RangeLineProps) {
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
          aria-label="Lowest number"
          onChange={(from) => onEdit(setScaleRange(question, from, range.to), ["options*"])}
        />
      </SettingPair>
      <SettingPair>
        to
        <RangeSelect
          value={range.to}
          items={toItems}
          aria-label="Highest number"
          onChange={(to) => onEdit(setScaleRange(question, range.from, to), ["options*"])}
        />
      </SettingPair>
    </SettingLine>
  );
}

export { ScaleKindSelect, ScaleOptions, ScaleRange };
