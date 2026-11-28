import { EASE_OUT } from "@holler/design";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { controlText, Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/cn";
import { atPickLimit, otherShown, toggleOption } from "@/lib/respond";
import { useReduceMotion } from "@/lib/use-reduce-motion";
import { type ControlProps, labelOf, pickOne } from "./answer-control";

const rowClassName = cn(
  "relative min-h-11 gap-2.5 rounded-control bg-plate ps-3.5 pe-3 edge-2 md:min-h-10",
  "transition-[box-shadow,opacity] duration-150 ease-(--ease-out)",
  "hoverable:hover:not-has-[[data-checked]]:edge-3 data-disabled:opacity-45",
  "has-[[data-checked]]:shadow-[0_0_0_1.5px_var(--primary)]",
);

const labelClassName =
  "flex min-h-11 flex-1 items-center py-2 font-(--weight-body) text-base text-ink md:min-h-10";

const ownAnswer = "Your own answer";

function useFocusWhenShown(shown: boolean) {
  const ref = useRef<HTMLInputElement>(null);
  const wasShown = useRef(shown);
  useEffect(() => {
    if (shown && !wasShown.current) ref.current?.focus();
    wasShown.current = shown;
  }, [shown]);
  return ref;
}

function useJustPicked(picked: boolean) {
  const before = useRef(picked);
  const just = picked && !before.current;
  useEffect(() => {
    before.current = picked;
  }, [picked]);
  return just;
}

interface OwnAnswerProps {
  value: string;
  onChange: (text: string) => void;
  focus: boolean;
}

function OwnAnswerInput({ value, onChange, focus }: OwnAnswerProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <input
      ref={ref}
      aria-label={ownAnswer}
      placeholder="Write your own answer"
      value={value}
      maxLength={1000}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        labelClassName,
        controlText,
        "min-w-0 bg-transparent outline-none placeholder:text-muted",
      )}
    />
  );
}

function OptionRadios({ question, value, onValueChange, legendId }: ControlProps) {
  const picked = value.optionIds[0] ?? null;
  const other = question.options.find((o) => o.isOther);
  const justPicked = useJustPicked(other !== undefined && picked === other.id);
  return (
    <RadioGroup<string | null>
      aria-labelledby={legendId}
      value={picked}
      onValueChange={(next) => onValueChange(pickOne(value, next))}
      className="gap-2"
    >
      {question.options.map((option, index) => {
        const writing = option.isOther && picked === option.id;
        return (
          <Field key={option.id} orientation="horizontal" className={rowClassName}>
            <RadioGroupItem value={option.id} aria-label={writing ? option.label : undefined} />
            {writing ? (
              <OwnAnswerInput
                value={value.otherText}
                focus={justPicked}
                onChange={(otherText) => onValueChange({ ...value, otherText })}
              />
            ) : (
              <FieldLabel className={labelClassName}>{labelOf(question, index)}</FieldLabel>
            )}
          </Field>
        );
      })}
    </RadioGroup>
  );
}

function OptionChecks({ question, value, onValueChange, legendId }: ControlProps) {
  const full = atPickLimit(question, value);
  const other = question.options.find((o) => o.isOther);
  const justPicked = useJustPicked(other !== undefined && value.optionIds.includes(other.id));
  return (
    <div role="group" aria-labelledby={legendId} className="flex flex-col gap-2">
      {question.options.map((option, index) => {
        const on = value.optionIds.includes(option.id);
        const writing = option.isOther && on;
        return (
          <Field
            key={option.id}
            orientation="horizontal"
            className={rowClassName}
            disabled={full && !on}
          >
            <Checkbox
              checked={on}
              aria-label={writing ? option.label : undefined}
              onCheckedChange={(next) =>
                onValueChange(toggleOption(question, value, option.id, next))
              }
            />
            {writing ? (
              <OwnAnswerInput
                value={value.otherText}
                focus={justPicked}
                onChange={(otherText) => onValueChange({ ...value, otherText })}
              />
            ) : (
              <FieldLabel className={labelClassName}>{labelOf(question, index)}</FieldLabel>
            )}
          </Field>
        );
      })}
    </div>
  );
}

function OtherText({ question, value, onValueChange }: ControlProps) {
  const shown = otherShown(question, value);
  const ref = useFocusWhenShown(shown);
  return (
    <Reveal shown={shown}>
      <Input
        ref={ref}
        aria-label={ownAnswer}
        placeholder="Write your own answer"
        value={value.otherText}
        maxLength={1000}
        onChange={(e) => onValueChange({ ...value, otherText: e.target.value })}
      />
    </Reveal>
  );
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

export { OptionChecks, OptionRadios, OtherText, Reveal };
