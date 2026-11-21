import { otherLabel } from "@holler/core";
import { MessageSquareText, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TriggerChevron } from "@/components/ui/overlay-list";
import { cn } from "@/lib/cn";
import { answerLabels, type CardProblems, type EditorQuestion, filled } from "./model";
import { useProblemId } from "./parts";

interface Props {
  question: EditorQuestion;
  number: number;
  onEdit: (next: EditorQuestion, fixes: string[]) => void;
  /** After the note is removed, so the card can put focus somewhere that still exists. */
  onRemoved?: (() => void) | undefined;
  problems?: CardProblems | undefined;
  /** Puts the cursor in the note's prompt once, when the note was just added. */
  autoFocus?: boolean | undefined;
}

const count = new Intl.NumberFormat();

/** The words in the Show after control: any answer, the one or two chosen, or how many. */
function afterWords(onlyAfter: number[] | null, labels: string[]) {
  if (onlyAfter === null) return "any answer";
  const names = onlyAfter.map((at) => `“${labels[at] ?? ""}”`);
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${count.format(names.length)} answers`;
}

/**
 * The picker reads as part of the sentence: ink words and a chevron with no box, a grey fill under
 * the pointer or while open, and the red edge only when it is at fault.
 */
const quietPicker = cn(
  "relative -mx-1 inline-flex h-7 max-w-full min-w-0 items-center gap-0.5 rounded-sm px-1 text-ink text-sm",
  "transition-[background-color,box-shadow] duration-150 hoverable:hover:bg-track data-popup-open:bg-track active:bg-track aria-invalid:bg-danger aria-invalid:edge-danger",
  "pointer-coarse:before:absolute pointer-coarse:before:-inset-y-2 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']",
);

interface AfterProps {
  number: number;
  onlyAfter: number[] | null;
  labels: string[];
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (onlyAfter: number[] | null) => void;
}

/**
 * Which answers bring the note. As in Tally, Any answer and chosen answers exclude each other:
 * choosing an answer clears Any answer, choosing Any answer clears the rest, and clearing the last
 * chosen answer falls back to Any answer.
 */
function ShowAfter({ number, onlyAfter, labels, invalid, describedBy, onChange }: AfterProps) {
  const chosen = new Set(onlyAfter ?? []);
  const toggle = (at: number, on: boolean) => {
    const next = labels.map((_, i) => i).filter((i) => (i === at ? on : chosen.has(i)));
    onChange(next.length > 0 ? next : null);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Show the note after: ${afterWords(onlyAfter, labels)}`}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={quietPicker}
          />
        }
      >
        <span className="min-w-0 truncate">{afterWords(onlyAfter, labels)}</span>
        <TriggerChevron />
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label={`Show the note for question ${number} after`}>
        <DropdownMenuCheckboxItem
          checked={onlyAfter === null}
          onCheckedChange={(on) => on && onChange(null)}
        >
          Any answer
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {labels.map((label, at) => (
          <DropdownMenuCheckboxItem
            // Labels can repeat while they are being written; the position cannot.
            // biome-ignore lint/suspicious/noArrayIndexKey: an answer is its position here
            key={at}
            checked={chosen.has(at)}
            onCheckedChange={(on) => toggle(at, on)}
          >
            <span className="truncate">{label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The note asked for after a choice question: its prompt, and the answers that bring it, in the
 * panel's head. Only after chosen answers needs the web page, because a Slack form cannot show or
 * hide a field; the editor's bar says so, naming the question, so the panel does not repeat it.
 */
function FollowUpEditor({ question, number, onEdit, onRemoved, problems = {}, autoFocus }: Props) {
  const q = filled(question);
  const prompt = useRef<HTMLInputElement>(null);
  const promptId = useProblemId("followUp.prompt");
  const afterId = useProblemId("followUp");
  useEffect(() => {
    if (autoFocus) prompt.current?.focus();
  }, [autoFocus]);
  if (!q.followUp) return null;
  const followUp = q.followUp;
  const labels = answerLabels(question, otherLabel).map(
    (label, at) => label.trim() || `Option ${at + 1}`,
  );
  const promptProblem = problems["followUp.prompt"];
  return (
    <div
      data-slot="follow-up-editor"
      className="flex flex-col gap-2.5 rounded-control bg-well p-3 ps-3.5"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 py-0.5 text-ink-2 text-sm">
          <MessageSquareText aria-hidden className="me-0.5 size-4 shrink-0" strokeWidth={2} />
          <span>Follow-up note after</span>
          <ShowAfter
            number={number}
            onlyAfter={followUp.onlyAfter}
            labels={labels}
            invalid={Boolean(problems.followUp)}
            describedBy={afterId}
            onChange={(onlyAfter) =>
              onEdit({ ...q, followUp: { ...followUp, onlyAfter } }, ["followUp"])
            }
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove the follow-up note from question ${number}`}
          onClick={() => {
            onEdit({ ...q, followUp: null }, ["followUp*"]);
            onRemoved?.();
          }}
          className="text-muted hoverable:hover:bg-track"
        >
          <X />
        </Button>
      </div>
      <div className="relative">
        <Input
          ref={prompt}
          size="sm"
          value={followUp.prompt}
          placeholder="Anything to add?"
          maxLength={300}
          aria-label={`Follow-up note for question ${number}`}
          aria-invalid={promptProblem ? true : undefined}
          aria-describedby={promptProblem ? promptId : undefined}
          className="aria-invalid:bg-danger"
          onChange={(event) =>
            onEdit({ ...q, followUp: { ...followUp, prompt: event.target.value } }, [
              "followUp.prompt",
            ])
          }
        />
      </div>
    </div>
  );
}

export { FollowUpEditor };
