import type { RespondPerson, RespondQuestion } from "@holler/core";
import { otherOption } from "@holler/core";
import { CornerDownRight } from "lucide-react";
import { type ComponentProps, useId } from "react";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { count } from "@/lib/format";
import { type DraftAnswer, noteShown } from "@/lib/respond";
import { type ControlProps, inlineOptions, numbered } from "./answer-control";
import { OptionChecks, OptionRadios, Reveal } from "./answer-options";
import { OptionSearch, PeoplePicker } from "./answer-pickers";
import { NumberScale, WordScale, YesNo } from "./answer-scales";

interface Props extends Omit<ComponentProps<"fieldset">, "onChange"> {
  question: RespondQuestion;
  value: DraftAnswer;
  onValueChange: (next: DraftAnswer) => void;
  error?: string | undefined;
  number?: number | undefined;
  answered?: boolean | undefined;
  searchPeople: (query: string) => Promise<RespondPerson[]>;
}

const numberTone = {
  waiting: "bg-well text-muted",
  answered: "bg-tint text-tint-ink",
  problem: "bg-danger-ink text-plate",
};

function AnswerQuestion({
  question,
  value,
  onValueChange,
  error,
  number,
  answered = false,
  searchPeople,
  className,
  ...props
}: Props) {
  const legendId = useId();
  const errorId = useId();
  const descriptionId = useId();
  const hintId = useId();
  const hint = hintFor(question);
  const tone = error ? "problem" : answered ? "answered" : "waiting";
  const describedBy = [
    error && errorId,
    question.description && descriptionId,
    hint && hintId,
  ].filter(Boolean);
  return (
    <FieldSet
      data-slot="answer-question"
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy.join(" ") || undefined}
      className={cn("gap-0", className)}
      {...props}
    >
      <FieldLegend id={legendId} className="mb-0 flex w-full items-start gap-2.5 text-lg">
        {number !== undefined && (
          <span
            data-tone={tone}
            className={cn(
              "mt-px grid size-6 shrink-0 place-items-center rounded-sm text-xs tabular transition-colors duration-200",
              numberTone[tone],
            )}
          >
            {count(number)}
          </span>
        )}
        <span className="min-w-0 flex-1 text-pretty">{question.prompt}</span>
        {!question.required && (
          <span className="shrink-0 ps-2 pt-0.5 text-muted text-sm">Optional</span>
        )}
      </FieldLegend>
      {(error || question.description) && (
        <div className={cn("mt-1 flex flex-col gap-0.5 text-sm", number !== undefined && "ps-8.5")}>
          {error && (
            <p id={errorId} role="alert" className="text-danger-ink">
              {error}
            </p>
          )}
          {question.description && (
            <p id={descriptionId} className="text-muted">
              {question.description}
            </p>
          )}
        </div>
      )}
      <div className="mt-4">
        <Control
          question={question}
          value={value}
          onValueChange={onValueChange}
          legendId={legendId}
          searchPeople={searchPeople}
        />
      </div>
      {hint && (
        <p id={hintId} className="mt-2.5 text-muted text-sm">
          {hint}
        </p>
      )}
      <Reveal shown={noteShown(question, value)}>
        <Field data-slot="follow-up" className="mt-4 gap-2">
          <FieldLabel aside="Optional" className="flex items-center gap-2 text-base text-ink-2">
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
            className="min-h-20"
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
          className="max-w-40 tabular"
        />
      );
    case "person":
      return <PeoplePicker {...props} />;
    case "single":
      if (question.style === "scale" && numbered(question)) return <NumberScale {...props} />;
      if (question.style === "scale" && !otherOption(question)) return <WordScale {...props} />;
      if (question.style === "binary") return <YesNo {...props} />;
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

export { AnswerQuestion };
