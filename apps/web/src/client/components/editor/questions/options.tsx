import { otherLabel, slackLimits } from "@holler/core";
import { EASE_OUT } from "@holler/design";
import { Plus, X } from "lucide-react";
import { motion } from "motion/react";
import { type ClipboardEvent, type KeyboardEvent, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { controlText } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useReduceMotion } from "@/lib/use-reduce-motion";
import {
  addOption,
  type CardProblems,
  type EditorQuestion,
  filled,
  MOST_LABEL,
  newKey,
  pastedLabels,
  removeOption,
  setAllowOther,
  setOptionLabel,
} from "./model";
import {
  addRowClassName,
  OptionMark,
  optionRowClassName,
  previewChipClassName,
  useProblemDescriber,
} from "./parts";

/** With a mouse, a row's remove button shows while the row is hovered or focused; on touch it always shows. */
const revealed =
  "text-muted hoverable:opacity-0 hoverable:group-hover/option:opacity-100 hoverable:group-focus-within/option:opacity-100 focus-visible:opacity-100";

/** The most options a question can hold, which is the schema's cap. */
const MOST_OPTIONS = slackLimits.selectOptions;

/**
 * Keys that follow each option through inserts and removals, so a row keeps its input, its focus
 * and its place while the options around it change. A change from outside starts them afresh.
 */
function useRowKeys(length: number) {
  const keys = useRef<string[]>([]);
  if (keys.current.length !== length) keys.current = Array.from({ length }, newKey);
  return {
    keys: keys.current,
    insert: (at: number, count = 1) => {
      keys.current = [
        ...keys.current.slice(0, at),
        ...Array.from({ length: count }, newKey),
        ...keys.current.slice(at),
      ];
      return keys.current.slice(at, at + count);
    },
    remove: (at: number) => {
      keys.current = keys.current.filter((_, i) => i !== at);
    },
  };
}

interface Props {
  question: EditorQuestion;
  /** The question's number, for each option's name: "Question 2, option 3". */
  number: number;
  onEdit: (next: EditorQuestion, fixes: string[]) => void;
  problems?: CardProblems | undefined;
}

/**
 * The options of a plain single or multiple choice question, one bordered row each, the way people
 * will see them. Enter adds a row under the one you are in, Backspace in an empty row removes it,
 * and pasting several lines makes one option of each.
 */
function ChoiceOptions({ question, number, onEdit, problems = {} }: Props) {
  const q = filled(question);
  const reduce = useReduceMotion();
  const describe = useProblemDescriber();
  const rows = useRowKeys(q.options.length);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focusNext = useRef<{ key: string; at: "start" | "end" } | null>(null);
  const settled = useRef(new Set(rows.keys));
  const addButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    for (const key of rows.keys) settled.current.add(key);
  });
  const shape = q.type === "multi" ? "check" : "radio";
  const canRemove = q.options.length > 2;
  const full = q.options.length >= MOST_OPTIONS;

  useLayoutEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    focusNext.current = null;
    const input = inputs.current.get(next.key);
    if (!input) return;
    input.focus();
    const caret = next.at === "end" ? input.value.length : 0;
    input.setSelectionRange(caret, caret);
  });

  const insertAfter = (index: number, labels: string[] = [""]) => {
    let next = question;
    labels.forEach((label, i) => {
      next = setOptionLabel(addOption(next, index + i), index + i + 1, label);
    });
    const [first] = rows.insert(index + 1, labels.length).slice(-1);
    if (first) focusNext.current = { key: first, at: "end" };
    onEdit(next, ["options*"]);
  };

  const remove = (index: number, focus: "previous" | "none") => {
    const before = rows.keys[index - 1] ?? rows.keys[index + 1];
    rows.remove(index);
    if (focus === "previous" && before) focusNext.current = { key: before, at: "end" };
    onEdit(removeOption(question, index), ["options*"]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (!full) insertAfter(index);
    } else if (event.key === "Backspace" && event.currentTarget.value === "" && canRemove) {
      event.preventDefault();
      remove(index, "previous");
    }
  };

  // Several lines pasted into one row become one option each, starting with the row itself.
  const onPaste = (event: ClipboardEvent<HTMLInputElement>, index: number) => {
    const pasted = pastedLabels(
      event.currentTarget.value,
      event.clipboardData.getData("text"),
      MOST_OPTIONS - q.options.length,
    );
    if (!pasted) return;
    event.preventDefault();
    const { first, added } = pasted;
    let next = setOptionLabel(question, index, first);
    added.forEach((label, i) => {
      next = setOptionLabel(addOption(next, index + i), index + i + 1, label);
    });
    const keys = rows.insert(index + 1, added.length);
    const last = keys.at(-1);
    if (last) focusNext.current = { key: last, at: "end" };
    onEdit(next, ["options*"]);
  };

  return (
    <div data-slot="choice-options" className="flex flex-col gap-1.5">
      <ul aria-label={`Options for question ${number}`} className="flex flex-col gap-1.5">
        {q.options.map((option, index) => {
          const key = rows.keys[index] ?? String(index);
          const problem = problems[`options.${index}`];
          const problemId = describe(`options.${index}`);
          // Read during render, written after commit: a render React throws away marks nothing.
          const fresh = !settled.current.has(key);
          return (
            <motion.li
              key={key}
              initial={fresh && !reduce ? { opacity: 0, y: -4 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
            >
              <div
                className={cn(
                  optionRowClassName,
                  "group/option has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-focus has-[input:focus-visible]:outline-offset-2",
                  problem && "bg-danger edge-danger",
                )}
              >
                <OptionMark shape={shape} />
                <input
                  ref={(el) => {
                    if (el) inputs.current.set(key, el);
                    else inputs.current.delete(key);
                  }}
                  value={option.label}
                  placeholder={`Option ${index + 1}`}
                  aria-label={`Question ${number}, option ${index + 1}`}
                  aria-invalid={problem ? true : undefined}
                  aria-describedby={problem ? problemId : undefined}
                  maxLength={MOST_LABEL}
                  enterKeyHint="next"
                  onChange={(event) =>
                    onEdit(setOptionLabel(question, index, event.target.value), [
                      `options.${index}`,
                      "options",
                    ])
                  }
                  onKeyDown={(event) => onKeyDown(event, index)}
                  onPaste={(event) => onPaste(event, index)}
                  className={cn(
                    controlText,
                    "min-w-0 flex-1 self-stretch bg-transparent text-ink outline-none placeholder:text-muted",
                  )}
                />
                {canRemove && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove option ${index + 1}`}
                    // Focus moves to the row beside it, never out of the card.
                    onClick={() => remove(index, "previous")}
                    className={cn(revealed, "hoverable:hover:bg-well")}
                  >
                    <X />
                  </Button>
                )}
              </div>
            </motion.li>
          );
        })}
        {q.allowOther && (
          <li className={cn(optionRowClassName, "group/option")}>
            <OptionMark shape={shape} />
            <span className="min-w-0 flex-1 py-2">
              {otherLabel}
              <span className="text-muted text-sm max-sm:hidden"> · people write in their own</span>
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${otherLabel}`}
              onClick={() => {
                onEdit(setAllowOther(question, false), ["options*", "allowOther"]);
                requestAnimationFrame(() => addButton.current?.focus());
              }}
              className={cn(revealed, "hoverable:hover:bg-well")}
            >
              <X />
            </Button>
          </li>
        )}
      </ul>
      {!full && (
        // As in Tally: one dashed row adds an option, and offers Other beside it until it is there.
        <div
          className={cn(
            addRowClassName,
            "gap-1.5 p-0",
            // Over "add Other" the row is not what a click adds, so it does not light up.
            "hoverable:has-[[data-slot=add-other]:hover]:bg-transparent",
            q.allowOther && "pe-3",
          )}
        >
          <button
            ref={addButton}
            type="button"
            className={cn(
              "flex min-h-11 items-center gap-2.5 self-stretch rounded-control ps-3 text-start focus-visible:-outline-offset-2 md:min-h-10",
              q.allowOther ? "flex-1" : "pe-0.5",
            )}
            onClick={() => insertAfter(q.options.length - 1)}
          >
            <Plus aria-hidden strokeWidth={2} />
            Add option
          </button>
          {!q.allowOther && (
            <>
              <span aria-hidden>or</span>
              <button
                type="button"
                data-slot="add-other"
                onClick={() => {
                  onEdit(setAllowOther(question, true), ["options*"]);
                  // This link goes once Other is there; focus stays in the row, on Add option.
                  requestAnimationFrame(() => addButton.current?.focus());
                }}
                className="relative -mx-1 rounded-sm px-1 underline decoration-edge-3 underline-offset-4 transition-colors hoverable:hover:text-tint-ink hoverable:hover:decoration-current pointer-coarse:before:absolute pointer-coarse:before:-inset-3 pointer-coarse:before:content-['']"
              >
                add &ldquo;{otherLabel}&rdquo;
              </button>
              {/* The rest of the row adds an option too, without a second tab stop. */}
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                onClick={() => insertAfter(q.options.length - 1)}
                className="flex-1 self-stretch outline-none"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface PresetProps {
  question: EditorQuestion;
  number: number;
}

/**
 * Options that come with the type, such as Yes and No: a quiet preview of what people pick from,
 * with no control's edge, because nothing here is edited.
 */
function PresetOptions({ question, number }: PresetProps) {
  const q = filled(question);
  return (
    <div data-slot="preset-options">
      <ul aria-label={`Options for question ${number}`} className="flex flex-wrap gap-1.5">
        {q.options.map((option, at) => (
          // oxlint-disable-next-line react/no-array-index-key -- preset answers are fixed by the type
          <li key={at} className={previewChipClassName}>
            <OptionMark shape="radio" />
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export { ChoiceOptions, PresetOptions };
