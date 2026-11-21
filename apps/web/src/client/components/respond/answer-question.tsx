import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import type { RespondPerson, RespondQuestion } from "@holler/core";
import { otherOption } from "@holler/core";
import { EASE_OUT } from "@holler/design";
import { Check, CornerDownRight, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
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

const inlineOptions = 12;

interface Props extends Omit<ComponentProps<"fieldset">, "onChange"> {
  question: RespondQuestion;
  value: DraftAnswer;
  onValueChange: (next: DraftAnswer) => void;
  error?: string | undefined;
  number?: number | undefined;
  searchPeople: (query: string) => Promise<RespondPerson[]>;
}

function AnswerQuestion({
  question,
  value,
  onValueChange,
  error,
  number,
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
      <FieldLegend
        id={legendId}
        className={cn(
          "flex w-full items-baseline gap-2 text-lg",
          question.description || hint || error ? "mb-1" : "mb-3",
        )}
      >
        {number !== undefined && (
          <span className="shrink-0 text-muted tabular">{count(number)}.</span>
        )}
        <span className="min-w-0 flex-1 text-pretty">{question.prompt}</span>
        {!question.required && <span className="shrink-0 ps-2 text-muted text-sm">Optional</span>}
      </FieldLegend>
      {(question.description || hint || error) && (
        <div className="flex flex-col gap-0.5 text-muted text-sm">
          <FieldError className="mb-0.5">{error}</FieldError>
          {question.description && <p>{question.description}</p>}
          {hint && <p>{hint}</p>}
        </div>
      )}
      <Control
        question={question}
        value={value}
        onValueChange={onValueChange}
        legendId={legendId}
        searchPeople={searchPeople}
      />
      <Reveal shown={noteShown(question, value)}>
        <Field data-slot="follow-up" className="gap-2.5 rounded-control bg-well p-4">
          <FieldLabel aside="Optional" className="flex items-center gap-2 text-ink">
            <CornerDownRight
              aria-hidden
              size={16}
              strokeWidth={2}
              className="shrink-0 text-muted"
            />
            {question.followUp?.prompt}
          </FieldLabel>
          <Textarea
            value={value.note}
            maxLength={4000}
            onChange={(e) => onValueChange({ ...value, note: e.target.value })}
            className="min-h-20 bg-plate"
          />
        </Field>
      </Reveal>
    </FieldSet>
  );
}

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
  searchPeople: (query: string) => Promise<RespondPerson[]>;
}

function Control(props: ControlProps) {
  const { question, value, onValueChange, legendId } = props;
  const a11y = { "aria-labelledby": legendId };
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
        />
      );
    case "person":
      return <PeoplePicker {...props} />;
    case "single":
      if (question.style === "scale" && numbered(question)) return <NumberScale {...props} />;
      if (question.style === "scale" && !otherOption(question)) return <WordScale {...props} />;
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

function OtherText({ question, value, onValueChange }: ControlProps) {
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
        value={value.otherText}
        maxLength={1000}
        onChange={(e) => onValueChange({ ...value, otherText: e.target.value })}
      />
    </Reveal>
  );
}

function OptionRadios(props: ControlProps) {
  const { question, value, onValueChange, legendId } = props;
  const picked = value.optionIds[0] ?? null;
  return (
    <div className="flex flex-col">
      <RadioGroup<string | null>
        aria-labelledby={legendId}
        value={picked}
        onValueChange={(next) => onValueChange({ ...value, optionIds: next ? [next] : [] })}
        className="gap-0"
      >
        {question.options.map((option, index) => (
          <Field
            key={option.id}
            orientation="horizontal"
            className="min-h-8 py-0.5 pointer-coarse:min-h-11"
          >
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
    <div className="flex flex-col">
      <div role="group" aria-labelledby={legendId} className="flex flex-col">
        {question.options.map((option, index) => {
          const on = value.optionIds.includes(option.id);
          return (
            <Field
              key={option.id}
              orientation="horizontal"
              className="min-h-8 py-0.5 pointer-coarse:min-h-11"
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
);

const phoneRow = 6;

function scaleColumns(count: number): CSSProperties {
  const phone = count <= phoneRow ? count : Math.ceil(count / 2);
  return {
    "--scale-phone": `repeat(${phone}, minmax(0, 1fr))`,
    "--scale-columns": `repeat(${count}, minmax(0, 1fr))`,
  } as CSSProperties;
}

function NumberScale({ question, value, onValueChange, legendId }: ControlProps) {
  const picked = value.optionIds[0] ?? null;
  return (
    <div className="flex flex-col gap-2">
      <RadioGroupPrimitive<string | null>
        aria-labelledby={legendId}
        value={picked}
        onValueChange={(next) => onValueChange({ ...value, optionIds: next ? [next] : [] })}
        className="grid grid-cols-(--scale-phone) gap-1.5 sm:grid-cols-(--scale-columns)"
        style={scaleColumns(question.options.length)}
      >
        {question.options.map((option, index) => (
          <RadioPrimitive.Root
            key={option.id}
            value={option.id}
            aria-label={labelOf(question, index)}
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

function Tiles({ question, value, onValueChange, legendId }: ControlProps) {
  const picked = value.optionIds[0] ?? null;
  return (
    <RadioGroupPrimitive<string | null>
      aria-labelledby={legendId}
      value={picked}
      onValueChange={(next) => onValueChange({ ...value, optionIds: next ? [next] : [] })}
      className="grid grid-cols-2 gap-2 sm:max-w-sm"
    >
      {question.options.map((option, index) => (
        <RadioPrimitive.Root
          key={option.id}
          value={option.id}
          className={cn(tileClassName, "flex gap-2 [&_svg]:size-[18px]")}
        >
          {index === 0 ? <Check aria-hidden strokeWidth={2} /> : <X aria-hidden strokeWidth={2} />}
          {option.label}
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}

function WordScale({ question, value, onValueChange, legendId }: ControlProps) {
  const picked = value.optionIds[0] ?? null;
  return (
    <RadioGroupPrimitive<string | null>
      aria-labelledby={legendId}
      value={picked}
      onValueChange={(next) => onValueChange({ ...value, optionIds: next ? [next] : [] })}
      className="grid gap-1.5 sm:grid-cols-(--scale-columns)"
      style={
        {
          "--scale-columns": `repeat(${question.options.length}, minmax(0, 1fr))`,
        } as CSSProperties
      }
    >
      {question.options.map((option, index) => (
        <RadioPrimitive.Root
          key={option.id}
          value={option.id}
          className={cn(tileClassName, "py-2 text-center text-balance leading-snug sm:text-sm")}
        >
          {labelOf(question, index)}
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

function OptionSearch(props: ControlProps) {
  const { question, value, onValueChange, legendId } = props;
  const items: Item[] = question.options.map((o, index) => ({
    value: o.id,
    label: labelOf(question, index),
  }));
  const chosen = items.filter((item) => value.optionIds.includes(item.value));
  const trigger = (
    <ComboboxTrigger aria-labelledby={legendId}>
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

const namesOf = (items: readonly Item[], placeholder: string): ReactNode =>
  items.length === 0 ? (
    <span data-placeholder="" className="text-muted">
      {placeholder}
    </span>
  ) : (
    new Intl.ListFormat(undefined).format(items.map((i) => i.label))
  );

function PeoplePicker({ question, value, onValueChange, legendId, searchPeople }: ControlProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const found = usePeopleSearch(searchPeople, query.trim(), open);
  const toItem = (p: RespondPerson): Item => ({
    value: p.slackUserId,
    label: p.name,
    avatarUrl: p.avatarUrl,
  });
  const chosen = value.people.map(toItem);
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
    <ComboboxTrigger aria-labelledby={legendId}>
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
          className="-m-1 overflow-hidden p-1"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { AnswerQuestion };
