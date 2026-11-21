import { type QuestionTemplate, questionTemplates } from "@holler/core";
import {
  CircleCheck,
  CircleDot,
  Gauge,
  Hash,
  type LucideIcon,
  Plus,
  SquareCheck,
  Type,
  UserRound,
} from "lucide-react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Chip } from "@/components/ui/chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TriggerChevron } from "@/components/ui/overlay-list";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { ProblemMark } from "./parts";

/*
 * The kinds of question, grouped the way people think of them: pick from choices, place on a
 * scale, or write in. One list feeds the card's type control and the Add question menu.
 */

const icons: Record<string, LucideIcon> = {
  single: CircleDot,
  multi: SquareCheck,
  binary: CircleCheck,
  person: UserRound,
  rating: Gauge,
  agreement: Gauge,
  frequency: Gauge,
  scale: Gauge,
  text: Type,
  number: Hash,
};

/** The question types new to Holler, marked New in the Add question menu. */
const fresh = new Set(["person", "scale", "number"]);

const typeGroups = [
  { id: "choice", label: "Choice" },
  { id: "scale", label: "Scale" },
  { id: "write", label: "Write in" },
] as const;

const inGroup = (group: QuestionTemplate["group"]) =>
  questionTemplates.filter((t) => t.group === group);

function TypeIcon({ id, className }: { id: string; className?: string | undefined }) {
  const Icon = icons[id] ?? CircleDot;
  return <Icon aria-hidden className={cn("size-4 shrink-0", className)} strokeWidth={2} />;
}

/**
 * Ten types and three group names fit a laptop window without the list scrolling: 32 px rows and
 * short group names with a mouse. Under a finger the rows keep their 44 px.
 */
const tightRow = "md:hoverable:h-8";
const tightLabel = "md:hoverable:pt-2 md:hoverable:pb-1";

const items = questionTemplates.map((t) => ({ value: t.id, label: t.label }));

interface SelectProps {
  /** The question template the question looks like now, from `templateFor`. */
  value: string;
  onValueChange: (id: string) => void;
  "aria-label": string;
  /** A send problem is about the type: the box gets a red edge and a mark. */
  invalid?: boolean | undefined;
  /** The card's problem sentence about the type. */
  "aria-describedby"?: string | undefined;
}

/** The card's type control: what kind of answer the question takes. Changing it remakes the question. */
function QuestionTypeSelect({
  value,
  onValueChange,
  "aria-label": label,
  invalid = false,
  "aria-describedby": describedBy,
}: SelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => next && next !== value && onValueChange(next)}
      items={items}
    >
      <SelectTrigger
        variant="chip"
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          "relative inline-flex h-8 min-w-0 shrink items-center gap-1.5 rounded-control bg-plate ps-2.5 pe-2 text-ink text-sm edge-2",
          "transition-[box-shadow] duration-150 hoverable:hover:not-aria-invalid:edge-3 data-open:not-aria-invalid:edge-3 aria-invalid:edge-danger",
          "pointer-coarse:before:absolute pointer-coarse:before:-inset-y-1.5 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']",
        )}
      >
        <TypeIcon id={value} className="text-ink-2" />
        <SelectValue className="min-w-0" />
        {invalid && <ProblemMark />}
        <TriggerChevron />
      </SelectTrigger>
      <SelectContent aria-label="Question type">
        {typeGroups.map((group) => (
          <SelectGroup key={group.id}>
            <SelectLabel className={tightLabel}>{group.label}</SelectLabel>
            {inGroup(group.id).map((t) => (
              <SelectItem key={t.id} value={t.id} className={tightRow}>
                <TypeRow template={t} />
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function TypeRow({ template, aside }: { template: QuestionTemplate; aside?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <TypeIcon id={template.id} className="text-ink-2" />
      <span className="truncate">{template.label}</span>
      {template.hint && <span className="ms-auto ps-3 text-muted text-sm">{template.hint}</span>}
      {aside}
    </span>
  );
}

interface MenuProps {
  /** The control that opens the menu, such as the dashed Add question button. */
  trigger: ReactElement;
  onPick: (id: string) => void;
  side?: "top" | "bottom" | undefined;
}

/** Every question type in three groups, in one column, to add a question. */
function QuestionTypeMenu({ trigger, onPick, side }: MenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent aria-label="Question types" side={side}>
        {typeGroups.map((group) => (
          <DropdownMenuGroup key={group.id} className="flex flex-col">
            <DropdownMenuLabel className={tightLabel}>{group.label}</DropdownMenuLabel>
            {inGroup(group.id).map((t) => (
              <DropdownMenuItem key={t.id} className={tightRow} onClick={() => onPick(t.id)}>
                <TypeIcon id={t.id} className="text-ink-2" />
                {t.label}
                {fresh.has(t.id) ? (
                  <Chip variant="tint" className="ms-auto h-5 px-1.5">
                    New
                  </Chip>
                ) : (
                  t.hint && <span className="ms-auto ps-3 text-muted text-sm">{t.hint}</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AddProps extends Omit<ComponentProps<"button">, "children"> {
  onPick: (id: string) => void;
}

/** The dashed button under the last card. It opens the type menu; picking a type adds a question. */
function AddQuestion({ onPick, className, ...props }: AddProps) {
  return (
    <QuestionTypeMenu
      onPick={onPick}
      trigger={
        <button
          type="button"
          data-slot="add-question"
          className={cn(
            "flex h-[52px] w-full items-center justify-center gap-2 rounded-plate border border-edge-3 border-dashed font-normal text-ink-2",
            "transition-[background-color,color] duration-150 hoverable:hover:bg-hover hoverable:hover:text-ink data-popup-open:bg-hover data-popup-open:text-ink",
            className,
          )}
          {...props}
        >
          <Plus aria-hidden className="size-[18px]" strokeWidth={2} />
          Add question
        </button>
      }
    />
  );
}

export { AddQuestion, QuestionTypeMenu, QuestionTypeSelect, TypeIcon };
