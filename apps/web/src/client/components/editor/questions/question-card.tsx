import { isChoice, templateFor } from "@holler/core";
import { EASE_OUT, INSTANT } from "@holler/design";
import { AlignLeft, Copy, Ellipsis, MessageSquareText, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type ComponentProps,
  type KeyboardEvent,
  memo,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { controlText } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { useReduceMotion } from "@/lib/use-reduce-motion";
import { AnswerPreview, NumberBounds, PickLimit } from "./answers";
import { FollowUpEditor } from "./follow-up";
import {
  type CardProblems,
  changeTemplate,
  type EditorQuestion,
  filled,
  isPlainChoice,
  orderProblems,
} from "./model";
import { ChoiceOptions, PresetOptions } from "./options";
import { ProblemFoot, ProblemScopeProvider } from "./parts";
import { QuestionTypeSelect } from "./question-types";
import { ScaleKindSelect, ScaleOptions, ScaleRange } from "./scale";

/** Browsers without `field-sizing` (Firefox, older Safari) get a one-line box that scrolls. */
const growsItself = typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");

/** Grows a text box to its words where the browser will not do it. */
function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, content: string) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: the box is measured again when its words change
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box || growsItself) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [ref, content]);
}

interface Props extends Omit<ComponentProps<"div">, "onChange"> {
  question: EditorQuestion;
  /** Its place in the list, from 1. */
  number: number;
  onChange: (next: EditorQuestion) => void;
  /** Left out when the Holler cannot take another question, which leaves Duplicate off. */
  onDuplicate?: (() => void) | undefined;
  onDelete: () => void;
  /** Send problems for this question, by path inside it: "prompt", "options.2". */
  problems?: CardProblems | undefined;
  /**
   * Called with the problem paths an edit answers, so their lines clear as the sender fixes them.
   * A path ending in `*` stands for every path that starts with what comes before it.
   */
  onFixed?: ((paths: string[]) => void) | undefined;
  /** The reorder handle, from the list. It sits beside the number. */
  grip?: ReactNode | undefined;
  /** Picked up to move: the card floats over the others. */
  lifted?: boolean | undefined;
  /** Moves the cursor to the prompt each time this number changes, for a question just added. */
  focusPrompt?: number | undefined;
}

/**
 * One question, always open, the way it will be asked. The head holds its number, its type,
 * Required and a menu; the prompt is the large field; under it come the answers people pick from,
 * and at the foot the settings the type allows, each a short sentence. A field at fault gets a red
 * edge and a mark; what is wrong is said once, in one line at the very foot.
 */
function QuestionCard({
  question,
  number,
  onChange,
  onDuplicate,
  onDelete,
  problems: sent = {},
  onFixed,
  grip,
  lifted = false,
  focusPrompt,
  className,
  ...props
}: Props) {
  const q = filled(question);
  const template = templateFor(q);
  const id = useId();
  const prompt = useRef<HTMLTextAreaElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const reduce = useReduceMotion();
  const description = useRef<HTMLTextAreaElement>(null);
  const [writingDescription, setWritingDescription] = useState(false);
  const [noteJustAdded, setNoteJustAdded] = useState(false);
  const showDescription = writingDescription || q.description !== "";
  useAutoGrow(prompt, q.prompt);
  useAutoGrow(description, `${showDescription}${q.description}`);

  useEffect(() => {
    if (focusPrompt) prompt.current?.focus();
  }, [focusPrompt]);
  useEffect(() => {
    if (writingDescription) description.current?.focus();
  }, [writingDescription]);

  const edit = (next: EditorQuestion, fixes: string[]) => {
    onChange(next);
    onFixed?.([...fixes, ""]);
  };

  // A part's own problems, such as a bound that is not a number yet, sit over the sent ones.
  const [own, setOwn] = useState<Record<string, CardProblems>>({});
  const report = useCallback((source: string, found: CardProblems) => {
    setOwn((current) =>
      JSON.stringify(current[source] ?? {}) === JSON.stringify(found)
        ? current
        : { ...current, [source]: found },
    );
  }, []);
  const problems: CardProblems = Object.assign({}, sent, ...Object.values(own));
  const sentences = orderProblems(problems).map((problem, i) => ({
    ...problem,
    id: `${id}-problem-${i}`,
  }));
  // The red plate stays under the card while its last line closes.
  const [plate, setPlate] = useState(sentences.length > 0);
  if (sentences.length > 0 && !plate) setPlate(true);
  const idByPath = new Map(sentences.flatMap((s) => s.paths.map((path) => [path, s.id])));
  const describeKey = JSON.stringify([...idByPath]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the map is rebuilt each render; its content is the key
  const scope = useMemo(
    () => ({ describe: (path: string) => idByPath.get(path), report }),
    [describeKey, report],
  );

  const promptProblem = problems.prompt;
  const descriptionProblem = problems.description;
  const typePath = ["type", "style", "allowOther"].find((path) => problems[path]);
  const plain = isPlainChoice(q);
  const choice = isChoice(q.type);
  const pickLimit = q.type === "person" || (q.type === "multi" && plain);
  const required = (
    <Field orientation="horizontal" className="w-auto gap-2">
      <FieldLabel className="text-muted text-sm">Required</FieldLabel>
      <Switch
        size="sm"
        checked={q.required}
        onCheckedChange={(checked) => edit({ ...q, required: checked }, ["required"])}
      />
    </Field>
  );
  // A choice question can ask a follow-up note; the menu adds it.
  const canFollowUp = choice && !q.followUp;
  // The one settings sentence the type has, if any: "People can pick [up to 2]".
  const setting = pickLimit ? (
    // Keyed by type: a person's own number never carries over into multiple choice, or back.
    <PickLimit key={q.type} question={question} onEdit={edit} problems={problems} />
  ) : q.type === "number" ? (
    <NumberBounds question={question} onEdit={edit} problems={problems} />
  ) : q.style === "scale" && template.id === "scale" ? (
    <ScaleRange question={question} onEdit={edit} />
  ) : null;

  return (
    <ProblemScopeProvider value={scope}>
      {/* With a problem, the card sits on a red plate that shows below it with what to fix. The
          frame is always there, so the card never remounts and keeps its focus as problems clear. */}
      <div data-slot="question-card-frame" className={cn("rounded-plate", plate && "bg-danger")}>
        <div
          ref={card}
          data-slot="question-card"
          data-lifted={lifted || undefined}
          className={cn(
            "group/card @container/card relative flex flex-col gap-3 rounded-plate bg-plate px-4 pt-4 pb-4 sm:px-5 sm:pt-[18px]",
            "transition-[box-shadow] duration-200 ease-(--ease-out)",
            lifted ? "floating" : "edge",
            className,
          )}
          {...props}
        >
          <div className="flex min-w-0 items-center gap-2 @md/card:gap-2.5">
            {grip}
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-sm bg-well text-ink-2 text-sm tabular"
            >
              {number}
            </span>
            <QuestionTypeSelect
              value={template.id}
              aria-label={`Type of question ${number}`}
              invalid={typePath !== undefined}
              aria-describedby={typePath && idByPath.get(typePath)}
              compact={q.style === "scale"}
              onValueChange={(next) => {
                edit(changeTemplate(question, next), ["*"]);
              }}
            />
            {q.style === "scale" && (
              <ScaleKindSelect
                question={question}
                templateId={template.id}
                number={number}
                onEdit={edit}
              />
            )}
            <div className="ms-auto flex shrink-0 items-center gap-3">
              <div className="hidden @md/card:flex">{required}</div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`More for question ${number}`}
                      className="text-muted data-popup-open:bg-hover data-popup-open:text-ink"
                    />
                  }
                >
                  <Ellipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent aria-label={`Question ${number}`} align="end">
                  {!showDescription && (
                    <DropdownMenuItem onClick={() => setWritingDescription(true)}>
                      <AlignLeft />
                      Add description
                    </DropdownMenuItem>
                  )}
                  {canFollowUp && (
                    <DropdownMenuItem
                      onClick={() => {
                        setNoteJustAdded(true);
                        edit({ ...q, followUp: { prompt: "", onlyAfter: null } }, ["followUp*"]);
                      }}
                    >
                      <MessageSquareText />
                      Add a follow-up note
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem disabled={!onDuplicate} onClick={() => onDuplicate?.()}>
                    <Copy />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem tone="danger" onClick={onDelete}>
                    <Trash2 />
                    Delete question
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="relative flex flex-col gap-1">
            <label htmlFor={`${id}-prompt`} className="sr-only">
              Question {number}
            </label>
            <textarea
              ref={prompt}
              id={`${id}-prompt`}
              rows={1}
              value={q.prompt}
              placeholder="Write your question"
              maxLength={300}
              aria-invalid={promptProblem ? true : undefined}
              aria-describedby={promptProblem ? idByPath.get("prompt") : undefined}
              // A problem here clears when the cursor leaves, not at the first key, so the box
              // around the words does not jump away while they are being written.
              onChange={(event) =>
                edit({ ...q, prompt: event.target.value.replace(/\s*\n\s*/g, " ") }, [])
              }
              onBlur={(event) => {
                if (event.currentTarget.value.trim() !== "") onFixed?.(["prompt", ""]);
              }}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                // A question is one line; Enter never breaks it.
                if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault();
              }}
              className={cn(
                "-mx-1.5 resize-none rounded-sm bg-transparent px-1.5 py-0.5 text-ink text-lg leading-snug tracking-[-0.01em] [field-sizing:content] placeholder:text-muted",
                // At fault, it becomes a box flush with the options under it.
                promptProblem && "mx-0 rounded-control bg-danger px-3 py-1.5 edge-danger",
              )}
            />
            {showDescription && (
              <>
                <label htmlFor={`${id}-description`} className="sr-only">
                  Description for question {number}
                </label>
                <textarea
                  ref={description}
                  id={`${id}-description`}
                  rows={1}
                  value={q.description}
                  placeholder="Add a line of help"
                  maxLength={300}
                  aria-invalid={descriptionProblem ? true : undefined}
                  aria-describedby={descriptionProblem ? idByPath.get("description") : undefined}
                  onChange={(event) =>
                    edit({ ...q, description: event.target.value.replace(/\s*\n\s*/g, " ") }, [])
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing)
                      event.preventDefault();
                  }}
                  onBlur={(event) => {
                    onFixed?.(["description", ""]);
                    if (event.currentTarget.value.trim() === "") {
                      setWritingDescription(false);
                      if (q.description !== "") edit({ ...q, description: "" }, ["description"]);
                    }
                  }}
                  className={cn(
                    controlText,
                    "-mx-1.5 resize-none rounded-sm bg-transparent px-1.5 py-0.5 text-muted [field-sizing:content] placeholder:text-muted/80 md:hoverable:text-sm",
                    descriptionProblem && "mx-0 rounded-control bg-danger px-3 py-1.5 edge-danger",
                  )}
                />
              </>
            )}
          </div>

          {plain && (
            <ChoiceOptions question={question} number={number} onEdit={edit} problems={problems} />
          )}
          {q.style === "binary" && <PresetOptions question={question} number={number} />}
          {q.style === "scale" && (
            <ScaleOptions
              question={question}
              number={number}
              custom={template.id === "scale"}
              onEdit={edit}
              problems={problems}
            />
          )}
          {q.type === "text" && <AnswerPreview kind="text" />}
          {q.type === "person" && <AnswerPreview kind="person" />}
          {q.type === "number" && <AnswerPreview kind="number" />}

          {q.followUp && (
            <FollowUpEditor
              question={question}
              number={number}
              onEdit={(next, fixes) => {
                setNoteJustAdded(false);
                edit(next, fixes);
              }}
              problems={problems}
              autoFocus={noteJustAdded}
              onRemoved={() =>
                // The panel is gone, so focus goes back to the menu that added it.
                requestAnimationFrame(() =>
                  card.current
                    ?.querySelector<HTMLElement>('[aria-label^="More for question"]')
                    ?.focus(),
                )
              }
            />
          )}

          <div
            className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-2 border-divider border-t pt-3",
              !setting && "@md/card:hidden",
            )}
          >
            {setting}
            <div className="ms-auto @md/card:hidden">{required}</div>
          </div>
        </div>
        {/* The plate eases open and shut, so cards below slide rather than jump as problems clear. */}
        <AnimatePresence initial={false} onExitComplete={() => setPlate(false)}>
          {sentences.length > 0 && (
            <motion.div
              key="problem-foot"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={reduce ? INSTANT : { duration: 0.2, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <ProblemFoot sentences={sentences} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ProblemScopeProvider>
  );
}

/** Re-renders only when its own question, problems or handlers change, not on every edit in the list. */
const MemoQuestionCard = memo(QuestionCard);

export { MemoQuestionCard as QuestionCard };
