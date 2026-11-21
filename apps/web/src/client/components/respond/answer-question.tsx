import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import type { RespondPerson, RespondQuestion } from "@holler/core";
import { otherOption } from "@holler/core";
import { EASE_OUT } from "@holler/design";
import { AnimatePresence, motion } from "motion/react";
import { type ComponentProps, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { count } from "@/lib/format";
import { atPickLimit, type DraftAnswer, noteShown, otherShown, toggleOption } from "@/lib/respond";
import { useReduceMotion } from "@/lib/use-reduce-motion";

/**
 * One question on the web form, drawn for its type: radio rows, a row of numbers for a scale, two
 * tiles for yes or no, checkboxes, a search over a long list or the workspace's people, a box for
 * a number or for words. The Other write-in and the follow-up note open under the answer that asks
 * for them. The rules for what shows and what is sent live in lib/respond.ts.
 */

/** Up to this many options show as a list; past it, a search. Slack's own cut-off is 10. */
const inlineOptions = 12;

interface Props extends Omit<ComponentProps<"fieldset">, "onChange"> {
  question: RespondQuestion;
  value: DraftAnswer;
  onValueChange: (next: DraftAnswer) => void;
  /** The server's or the form's message for this question, shown under it. */
  error?: string | undefined;
  /** People in the workspace matching `query`, for a person question. */
  searchPeople: (query: string) => Promise<RespondPerson[]>;
}

function AnswerQuestion({
  question,
  value,
  onValueChange,
  error,
  searchPeople,
  className,
  ...props
}: Props) {
  const legendId = useId();
  const hint = hintFor(question);
  return (
    <FieldSet
      data-slot="answer-question"
      aria-invalid={error ? true : undefined}
      className={cn("gap-3", className)}
      {...props}
    >
      {/* A legend sits outside the set's flex gap, so its own margin spaces it. */}
      <FieldLegend
        id={legendId}
        className={cn(
          "flex w-full items-baseline gap-3 text-lg",
          question.description || hint ? "mb-1" : "mb-3",
        )}
      >
        <span className="min-w-0 flex-1 text-pretty">{question.prompt}</span>
        {!question.required && <span className="shrink-0 text-muted text-sm">Optional</span>}
      </FieldLegend>
      {(question.description || hint) && (
        <div className="flex flex-col gap-0.5 text-muted text-sm">
          {question.description && <p>{question.description}</p>}
          {hint && <p>{hint}</p>}
        </div>
      )}
      <Control
        question={question}
        value={value}
        onValueChange={onValueChange}
        legendId={legendId}
        invalid={Boolean(error)}
        searchPeople={searchPeople}
      />
      <Reveal shown={noteShown(question, value)}>
        <Field>
          <FieldLabel aside="Optional">{question.followUp?.prompt}</FieldLabel>
          <Textarea
            value={value.note}
            maxLength={4000}
            onChange={(e) => onValueChange({ ...value, note: e.target.value })}
            className="min-h-20"
          />
        </Field>
      </Reveal>
      <FieldError>{error}</FieldError>
    </FieldSet>
  );
}

/** "Pick up to 3", "A whole number from 1 to 7": how to answer, when the type does not show it. */
function hintFor(question: RespondQuestion): string | null {
  const limit = question.maxChoices;
  if (question.type === "multi") {
    return limit === null ? "Pick any." : `Pick up to ${count(limit)}.`;
  }
  if (question.type === "person") {
    if (limit === 1) return "Pick one person.";
    return limit === null ? "Pick anyone." : `Pick up to ${count(limit)} people.`;
  }
  if (question.type === "number") {
    const { numberMin: min, numberMax: max } = question;
    if (min !== null && max !== null) return `A whole number from ${count(min)} to ${count(max)}.`;
    if (min !== null) return `A whole number of ${count(min)} or more.`;
    if (max !== null) return `A whole number of ${count(max)} or less.`;
    return "A whole number.";
  }
  return null;
}

interface ControlProps {
  question: RespondQuestion;
  value: DraftAnswer;
  onValueChange: (next: DraftAnswer) => void;
  legendId: string;
  invalid: boolean;
  searchPeople: (query: string) => Promise<RespondPerson[]>;
}

function Control(props: ControlProps) {
  const { question, value, onValueChange, legendId, invalid } = props;
  const a11y = { "aria-labelledby": legendId, "aria-invalid": invalid || undefined };
  switch (question.type) {
    case "text":
      return (
        <Textarea
          {...a11y}
          value={value.text}
          maxLength={4000}
          onChange={(e) => onValueChange({ ...value, text: e.target.value })}
        />
      );
    case "number":
      return (
        <Input
          {...a11y}
          inputMode="numeric"
          autoComplete="off"
          value={value.number}
          onChange={(e) => onValueChange({ ...value, number: e.target.value })}
          className="w-40"
        />
      );
    case "person":
      return <PeoplePicker {...props} />;
    case "single":
      if (question.style === "scale" && numbered(question)) return <NumberScale {...props} />;
      if (question.style === "binary") return <Tiles {...props} />;
      return question.options.length > inlineOptions ? (
        <OptionSearch {...props} />
      ) : (
        <OptionRadios {...props} />
      );
    case "multi":
      return question.options.length > inlineOptions ? (
        <OptionSearch {...props} />
      ) : (
        <OptionChecks {...props} />
      );
  }
}

const numbered = (question: RespondQuestion) =>
  question.options.every((o) => /^\d+$/.test(o.label));

/** The Other write-in, right under the Other option, focused as Other is picked. */
function OtherText({ question, value, onValueChange, invalid }: ControlProps) {
  const ref = useRef<HTMLInputElement>(null);
  const shown = otherShown(question, value);
  const wasShown = useRef(shown);
  useEffect(() => {
    if (shown && !wasShown.current) ref.current?.focus();
    wasShown.current = shown;
  }, [shown]);
  return (
    <Reveal shown={shown}>
      <Input
        ref={ref}
        aria-label="If Other, what?"
        placeholder="If Other, what?"
        aria-invalid={(invalid && !value.otherText.trim()) || undefined}
        value={value.otherText}
        maxLength={1000}
        onChange={(e) => onValueChange({ ...value, otherText: e.target.value })}
        className="mt-1"
      />
    </Reveal>
  );
}

function OptionRadios(props: ControlProps) {
  const { question, value, onValueChange, legendId, invalid } = props;
  const picked = value.optionIds[0] ?? null;
  return (
    <div className="flex flex-col gap-1">
      <RadioGroup<string | null>
        aria-labelledby={legendId}
        aria-invalid={invalid || undefined}
        value={picked}
        onValueChange={(next) => onValueChange({ ...value, optionIds: next ? [next] : [] })}
        className="gap-0"
      >
        {question.options.map((option, index) => (
          <Field key={option.id} orientation="horizontal" className="min-h-11 py-1">
            <RadioGroupItem value={option.id} />
            <FieldLabel className="text-base text-ink">{labelOf(question, index)}</FieldLabel>
          </Field>
        ))}
      </RadioGroup>
      {otherOption(question) && (
        <div className="ps-[30px]">
          <OtherText {...props} />
        </div>
      )}
    </div>
  );
}

function OptionChecks(props: ControlProps) {
  const { question, value, onValueChange, legendId } = props;
  const full = atPickLimit(question, value);
  return (
    <div className="flex flex-col gap-1">
      {/* biome-ignore lint/a11y/useSemanticElements: the fieldset around this already is one; this names the checkboxes' group */}
      <div role="group" aria-labelledby={legendId} className="flex flex-col">
        {question.options.map((option, index) => {
          const on = value.optionIds.includes(option.id);
          return (
            <Field
              key={option.id}
              orientation="horizontal"
              className="min-h-11 py-1"
              // At the limit, the rest wait until one is unticked; the hint above says why.
              disabled={full && !on}
            >
              <Checkbox
                checked={on}
                onCheckedChange={(next) =>
                  onValueChange(toggleOption(question, value, option.id, next))
                }
              />
              <FieldLabel className="text-base text-ink">{labelOf(question, index)}</FieldLabel>
            </Field>
          );
        })}
      </div>
      {otherOption(question) && (
        <div className="ps-[32px]">
          <OtherText {...props} />
        </div>
      )}
    </div>
  );
}

/** A scale's words at each end go on its first and last option, as in Slack: "1, Chaos". */
function labelOf(question: RespondQuestion, index: number): string {
  const option = question.options[index];
  if (!option) return "";
  if (question.style !== "scale") return option.label;
  const last = question.options.length - 1;
  const word = index === 0 ? question.lowLabel : index === last ? question.highLabel : null;
  return word ? `${option.label}, ${word}` : option.label;
}

const tileClassName = cn(
  "relative grid min-h-11 cursor-pointer place-items-center rounded-control bg-plate px-3 text-base text-ink tabular edge",
  "transition-[background-color,box-shadow,color,scale] duration-150 ease-(--ease-out)",
  "hoverable:hover:not-data-checked:edge-2 active:scale-[0.97] motion-reduce:active:scale-100",
  "data-checked:bg-primary data-checked:text-on-primary data-checked:shadow-none",
  "focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2",
  "aria-invalid:edge-danger",
);

/** A numbered scale as one row of numbers, the words for each end under them. */
function NumberScale({ question, value, onValueChange, legendId, invalid }: ControlProps) {
  const picked = value.optionIds[0] ?? null;
  return (
    <div className="flex flex-col gap-2">
      <RadioGroupPrimitive<string | null>
        aria-labelledby={legendId}
        value={picked}
        onValueChange={(next) => onValueChange({ ...value, optionIds: next ? [next] : [] })}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${question.options.length}, minmax(0, 1fr))` }}
      >
        {question.options.map((option, index) => (
          <RadioPrimitive.Root
            key={option.id}
            value={option.id}
            aria-label={labelOf(question, index)}
            aria-invalid={invalid || undefined}
            className={tileClassName}
          >
            {option.label}
          </RadioPrimitive.Root>
        ))}
      </RadioGroupPrimitive>
      {(question.lowLabel || question.highLabel) && (
        <div aria-hidden="true" className="flex justify-between gap-4 text-muted text-sm">
          <span>{question.lowLabel}</span>
          <span className="text-end">{question.highLabel}</span>
        </div>
      )}
    </div>
  );
}

/** Yes or no: two tiles side by side. */
function Tiles({ question, value, onValueChange, legendId, invalid }: ControlProps) {
  const picked = value.optionIds[0] ?? null;
  return (
    <RadioGroupPrimitive<string | null>
      aria-labelledby={legendId}
      value={picked}
      onValueChange={(next) => onValueChange({ ...value, optionIds: next ? [next] : [] })}
      className="grid grid-cols-2 gap-2 sm:max-w-sm"
    >
      {question.options.map((option) => (
        <RadioPrimitive.Root
          key={option.id}
          value={option.id}
          aria-invalid={invalid || undefined}
          className={tileClassName}
        >
          {option.label}
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}

interface Item {
  value: string;
  label: string;
  avatarUrl?: string | null | undefined;
}

/** A long list of options, searched. Multiple choice keeps its pick limit. */
function OptionSearch(props: ControlProps) {
  const { question, value, onValueChange, legendId, invalid } = props;
  const items: Item[] = question.options.map((o, index) => ({
    value: o.id,
    label: labelOf(question, index),
  }));
  const chosen = items.filter((item) => value.optionIds.includes(item.value));
  const trigger = (
    <ComboboxTrigger aria-labelledby={legendId} aria-invalid={invalid || undefined}>
      <ComboboxValue>{() => namesOf(chosen, "Choose")}</ComboboxValue>
    </ComboboxTrigger>
  );
  const content = (
    <ComboboxContent aria-label={question.prompt}>
      <ComboboxInput aria-label="Search the options" placeholder="Search" />
      <ComboboxEmpty>No option matches that.</ComboboxEmpty>
      <ComboboxList>
        {(item: Item) => (
          <ComboboxItem key={item.value} value={item}>
            <span className="flex-1 truncate">{item.label}</span>
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  );
  return (
    <div className="flex flex-col gap-1">
      {question.type === "single" ? (
        <Combobox<Item>
          items={items}
          value={chosen[0] ?? null}
          isItemEqualToValue={(a, b) => a.value === b.value}
          onValueChange={(next) => onValueChange({ ...value, optionIds: next ? [next.value] : [] })}
        >
          {trigger}
          {content}
        </Combobox>
      ) : (
        <Combobox<Item, true>
          multiple
          items={items}
          value={chosen}
          isItemEqualToValue={(a, b) => a.value === b.value}
          onValueChange={(next) => {
            const ids = next.map((item) => item.value);
            // The pick limit holds here too: a tick past it is not taken.
            if (question.maxChoices !== null && ids.length > question.maxChoices) return;
            onValueChange({ ...value, optionIds: ids });
          }}
        >
          {trigger}
          {content}
        </Combobox>
      )}
      <OtherText {...props} />
    </div>
  );
}

/** The chosen names, "Mira and Tom", or the placeholder while nothing is chosen. */
const namesOf = (items: readonly Item[], placeholder: string): ReactNode =>
  items.length === 0 ? (
    <span data-placeholder="" className="text-muted">
      {placeholder}
    </span>
  ) : (
    new Intl.ListFormat(undefined).format(items.map((i) => i.label))
  );

/** Someone in the workspace, searched in Holler's copy of the Slack directory. */
function PeoplePicker({
  question,
  value,
  onValueChange,
  legendId,
  invalid,
  searchPeople,
}: ControlProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Searches only while the list is open, so no search can land after the answers are sent.
  const found = usePeopleSearch(searchPeople, query.trim(), open);
  const toItem = (p: RespondPerson): Item => ({
    value: p.slackUserId,
    label: p.name,
    avatarUrl: p.avatarUrl,
  });
  const chosen = value.people.map(toItem);
  // Who is chosen stays in the list while a search runs, so they can be unticked from it.
  const items = [
    ...chosen,
    ...(found.people ?? []).map(toItem).filter((i) => !chosen.some((c) => c.value === i.value)),
  ];
  const back = (picked: readonly Item[]) =>
    picked.map((item) => ({
      slackUserId: item.value,
      name: item.label,
      avatarUrl: item.avatarUrl ?? null,
    }));
  const one = question.maxChoices === 1;
  const trigger = (
    <ComboboxTrigger aria-labelledby={legendId} aria-invalid={invalid || undefined}>
      <ComboboxValue>
        {() => namesOf(chosen, one ? "Choose someone" : "Choose people")}
      </ComboboxValue>
    </ComboboxTrigger>
  );
  const content = (
    <ComboboxContent aria-label={question.prompt}>
      <ComboboxInput aria-label="Search people" placeholder="Search people" />
      <ComboboxEmpty>
        {found.people === null ? "Looking…" : "Nobody by that name in this workspace."}
      </ComboboxEmpty>
      <ComboboxList>
        {(item: Item) => (
          <ComboboxItem key={item.value} value={item}>
            <Avatar name={item.label} src={item.avatarUrl ?? null} seed={item.value} size="sm" />
            <span className="flex-1 truncate">{item.label}</span>
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  );
  const shared = {
    items,
    onOpenChange: setOpen,
    filter: null,
    inputValue: query,
    onInputValueChange: (next: string) => setQuery(next),
    isItemEqualToValue: (a: Item, b: Item) => a.value === b.value,
  };
  return one ? (
    <Combobox<Item>
      {...shared}
      value={chosen[0] ?? null}
      onValueChange={(next) => onValueChange({ ...value, people: next ? back([next]) : [] })}
    >
      {trigger}
      {content}
    </Combobox>
  ) : (
    <Combobox<Item, true>
      {...shared}
      multiple
      value={chosen}
      onValueChange={(next) => {
        if (question.maxChoices !== null && next.length > question.maxChoices) return;
        onValueChange({ ...value, people: back(next) });
      }}
    >
      {trigger}
      {content}
    </Combobox>
  );
}

/**
 * The people matching what is typed, a moment after typing stops, while `enabled`. A late answer
 * to an older search never replaces a newer one. Null until the first search answers.
 */
function usePeopleSearch(
  search: (query: string) => Promise<RespondPerson[]>,
  query: string,
  enabled: boolean,
) {
  const [people, setPeople] = useState<RespondPerson[] | null>(null);
  const latest = useRef(search);
  latest.current = search;
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const timer = setTimeout(() => {
      latest.current(query).then(
        (next) => {
          if (current) setPeople(next);
        },
        () => {
          if (current) setPeople([]);
        },
      );
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, enabled]);
  return { people };
}

/** Opens a part of the question in place: the Other write-in or the follow-up note. */
function Reveal({ shown, children }: { shown: boolean; children: ReactNode }) {
  const reduce = useReduceMotion();
  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          // Room for a focus ring, which the height animation would otherwise clip.
          className="-m-1 overflow-hidden p-1"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { AnswerQuestion };
