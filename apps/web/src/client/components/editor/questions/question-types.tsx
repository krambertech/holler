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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TriggerChevron } from "@/components/ui/overlay-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";

/*
 * The kinds of question, in one short list that feeds the card's type control and the Add
 * question menu. Every scale is one kind, Scale;
 * which scale (Rating, Agreement, Frequency or a custom one) is picked on the card, so the list
 * stays short as more ready scales arrive.
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
  scales: Gauge,
  text: Type,
  number: Hash,
};

/** The question types new to Holler, marked New in the Add question menu. */
const fresh = new Set(["person", "number"]);

/** The one kind every scale template belongs to. */
const SCALES = "scales";

/** The template a new scale starts from. */
const FIRST_SCALE = "rating";

interface Kind {
  id: string;
  label: string;
  /** The template a question of this kind is made from. */
  template: string;
  hint?: string | undefined;
}

const byGroup = (group: QuestionTemplate["group"]): Kind[] =>
  questionTemplates
    .filter((t) => t.group === group)
    .map((t) => ({ id: t.id, label: t.label, template: t.id, hint: t.hint }));

const [single, multi, binary, ...restOfChoice] = byGroup("choice");

/** Seven kinds are few enough for one list with no group names. */
const kinds: Kind[] = [
  ...[single, multi, binary].filter((k): k is Kind => k !== undefined),
  { id: SCALES, label: "Scale", template: FIRST_SCALE },
  ...restOfChoice,
  ...byGroup("write"),
];

/** The kind a template belongs to: its own, or Scale for every scale. */
function kindOf(templateId: string) {
  const t = questionTemplates.find((t) => t.id === templateId);
  return t?.group === "scale" ? SCALES : templateId;
}

/** A template's name in the type list: "Scale" for every scale. */
function kindLabel(templateId: string) {
  return kinds.find((k) => k.id === kindOf(templateId))?.label ?? templateId;
}

/** The scales a Scale question can be, for the card's scale control. */
const scaleTemplates = questionTemplates.filter((t) => t.group === "scale");

interface IconProps extends Omit<ComponentProps<"svg">, "ref"> {
  /** A kind or a template id: every scale shows the scale icon. */
  kind: string;
}

function TypeIcon({ kind, className, ...props }: IconProps) {
  const Icon = icons[kindOf(kind)] ?? icons[kind] ?? CircleDot;
  return (
    <Icon
      aria-hidden
      data-slot="type-icon"
      className={cn("size-4 shrink-0", className)}
      strokeWidth={2}
      {...props}
    />
  );
}

/** The box of the card head's controls: the type, and for a scale which scale. */
const typeChipClassName = cn(
  "relative inline-flex h-8 min-w-0 shrink items-center gap-1.5 rounded-control bg-plate ps-2.5 pe-2 text-ink text-sm edge-2",
  "transition-[box-shadow] duration-150 hoverable:hover:not-aria-invalid:edge-3 data-open:not-aria-invalid:edge-3 active:bg-well aria-invalid:bg-danger aria-invalid:edge-danger",
  "pointer-coarse:before:absolute pointer-coarse:before:-inset-y-1.5 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']",
);

const items = kinds.map((k) => ({ value: k.id, label: k.label }));

interface SelectProps {
  /** The question template the question looks like now, from `templateFor`. */
  value: string;
  /** Called with the template to remake the question from; a scale stays as it is. */
  onValueChange: (templateId: string) => void;
  "aria-label": string;
  /** A send problem is about the type: the box is tinted red with a red edge. */
  invalid?: boolean | undefined;
  /** The card's problem sentence about the type. */
  "aria-describedby"?: string | undefined;
  /** Another picker shares the head, such as which scale: on a narrow card show only the icon. */
  compact?: boolean | undefined;
}

/** The card's type control: what kind of answer the question takes. Changing it remakes the question. */
function QuestionTypeSelect({
  value,
  onValueChange,
  "aria-label": label,
  invalid = false,
  "aria-describedby": describedBy,
  compact = false,
}: SelectProps) {
  const kind = kindOf(value);
  return (
    <Select
      value={kind}
      onValueChange={(next) => {
        const picked = kinds.find((k) => k.id === next);
        if (picked && picked.id !== kind) onValueChange(picked.template);
      }}
      items={items}
    >
      <SelectTrigger
        variant="chip"
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={typeChipClassName}
      >
        <TypeIcon kind={kind} className="text-ink-2" />
        {/* Beside a scale picker on a narrow card, the type shows as its icon; its name is in the label. */}
        <SelectValue className={cn("min-w-0", compact && "@max-md/card:hidden")} />
        <span className={cn("contents", compact && "@max-md/card:hidden")}>
          <TriggerChevron />
        </span>
      </SelectTrigger>
      <SelectContent aria-label="Question type">
        {kinds.map((k) => (
          <SelectItem key={k.id} value={k.id} indicator="end">
            <TypeRow kind={k} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TypeRow({ kind, aside }: { kind: Kind; aside?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <TypeIcon kind={kind.id} className="text-ink-2" />
      <span className="truncate">{kind.label}</span>
      {kind.hint && <span className="ms-auto ps-3 text-muted text-sm">{kind.hint}</span>}
      {aside}
    </span>
  );
}

interface MenuProps {
  /** The control that opens the menu, such as the dashed Add question button. */
  render: ReactElement;
  onPick: (id: string) => void;
  side?: "top" | "bottom" | undefined;
}

/** Every kind of question in one list, to add a question. */
function QuestionTypeMenu({ render, onPick, side }: MenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={render} />
      <DropdownMenuContent aria-label="Question types" side={side}>
        {kinds.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => onPick(t.template)}>
            <TypeIcon kind={t.id} className="text-ink-2" />
            {t.label}
            {fresh.has(t.id) && (
              <Chip variant="tint" className="ms-auto h-5 px-1.5">
                New
              </Chip>
            )}
          </DropdownMenuItem>
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
      render={
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

export {
  AddQuestion,
  kindLabel,
  QuestionTypeMenu,
  QuestionTypeSelect,
  scaleTemplates,
  TypeIcon,
  typeChipClassName,
};
