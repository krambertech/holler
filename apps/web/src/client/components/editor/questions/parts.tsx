import { AlertCircle } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react";
import { cn } from "@/lib/cn";
import type { CardProblems } from "./model";

/*
 * Small pieces every question card shares: the mark beside an option, an option's row, the quiet
 * chips of a preview, a settings sentence with its small controls, and the card's problem line.
 */

interface MarkProps extends ComponentProps<"span"> {
  /** A circle for one answer, a square for several. */
  shape: "radio" | "check";
}

/** The empty radio or checkbox people will see, drawn beside each option. */
function OptionMark({ shape, className, ...props }: MarkProps) {
  return (
    <span
      aria-hidden
      data-slot="option-mark"
      className={cn(
        "size-3.5 shrink-0 shadow-[inset_0_0_0_1.5px_var(--faint)]",
        shape === "radio" ? "rounded-full" : "rounded-xs",
        className,
      )}
      {...props}
    />
  );
}

/** One option's box: the same row whether it is written in or Other. */
export const optionRowClassName =
  "relative flex min-h-11 items-center gap-2.5 rounded-control bg-plate ps-3 pe-1 edge-2 md:min-h-10";

/** A dashed row that adds something, such as an option. */
export const addRowClassName =
  "flex min-h-11 w-full items-center gap-2.5 rounded-control border border-edge-3 border-dashed ps-3 pe-3 text-muted transition-[color,background-color] duration-150 hoverable:hover:bg-hover hoverable:hover:text-ink md:min-h-10 [&_svg]:size-4 [&_svg]:shrink-0";

/** A step of an answer the type sets, such as Yes or 4: quiet text on the well, with no control's edge. */
export const previewChipClassName =
  "inline-flex h-8 items-center gap-2 rounded-sm bg-well px-3 text-ink-2 text-sm select-none";

/**
 * A small control inside a settings sentence: 28 px with a mouse, with a 44 px target under a finger
 * that reaches past its edge without moving the words around it.
 */
export const inlineControlClassName = cn(
  "relative inline-flex h-7 max-w-full min-w-0 items-center gap-1 rounded-sm bg-plate ps-2 pe-1.5 text-ink text-sm edge-2",
  "transition-[box-shadow] duration-150 hoverable:hover:not-aria-invalid:edge-3 data-popup-open:not-aria-invalid:edge-3 data-open:not-aria-invalid:edge-3 aria-invalid:edge-danger",
  "pointer-coarse:before:absolute pointer-coarse:before:-inset-y-2 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']",
);

/** A sentence of settings at the card's foot, such as "Whole number from [ ] to [ ]". */
function SettingLine({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="setting-line"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2 text-ink-2 text-sm",
        className,
      )}
      {...props}
    />
  );
}

/** A word and the control it introduces, kept on one line: "to [10]". */
function SettingPair({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap", className)}
      {...props}
    />
  );
}

/** The small alert drawn inside a field at fault, so the eye finds which input the foot line means. */
function ProblemMark({ className, ...props }: ComponentProps<"svg">) {
  return (
    <AlertCircle
      aria-hidden
      data-slot="problem-mark"
      strokeWidth={2}
      className={cn("pointer-events-none size-4 shrink-0 text-danger-dot", className)}
      {...props}
    />
  );
}

interface ProblemProps extends ComponentProps<"p"> {
  children: ReactNode;
}

/** A send problem, in danger ink with its icon, so colour is never the only sign. */
function ProblemLine({ className, children, ...props }: ProblemProps) {
  return (
    <p
      data-slot="problem-line"
      className={cn("flex items-start gap-1.5 text-danger-ink text-sm", className)}
      {...props}
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/*
 * A card's problems. Every field at fault gets a red edge and a mark; the words gather in one line
 * at the card's foot, one sentence per problem, and each field points at its sentence with
 * `aria-describedby`. A part that checks what is typed, such as the number bounds, reports its own.
 */

interface ProblemScope {
  /** The id of the foot sentence for this path, when it has a problem. */
  describe: (path: string) => string | undefined;
  /** A part's own problems, by path, replacing what it reported before. */
  report: (source: string, problems: CardProblems) => void;
}

const ProblemScopeContext = createContext<ProblemScope>({
  describe: () => undefined,
  report: () => {},
});

const ProblemScopeProvider = ProblemScopeContext.Provider;

/** The id to put on a field's `aria-describedby`, or undefined when the field is fine. */
function useProblemId(path: string) {
  return useContext(ProblemScopeContext).describe(path);
}

/** `useProblemId` for a list of fields, such as one option per row. */
function useProblemDescriber() {
  return useContext(ProblemScopeContext).describe;
}

/** Hands the card this part's own problems while it is on screen. */
function useReportProblems(source: string, problems: CardProblems) {
  const { report } = useContext(ProblemScopeContext);
  const latest = useRef(report);
  latest.current = report;
  const key = JSON.stringify(problems);
  useEffect(() => {
    latest.current(source, JSON.parse(key));
  }, [source, key]);
  useEffect(() => () => latest.current(source, {}), [source]);
}

interface FootProps extends ComponentProps<"p"> {
  /** One sentence each, in the order of the fields, with the id their fields point at. */
  sentences: { id: string; message: string }[];
}

/** The card's one problem line. */
function ProblemFoot({ sentences, ...props }: FootProps) {
  if (sentences.length === 0) return null;
  return (
    <ProblemLine {...props}>
      {sentences.map((sentence, i) => (
        <span key={sentence.id} id={sentence.id}>
          {i > 0 && " "}
          {sentence.message}
        </span>
      ))}
    </ProblemLine>
  );
}

export {
  OptionMark,
  ProblemFoot,
  ProblemLine,
  ProblemMark,
  ProblemScopeProvider,
  SettingLine,
  SettingPair,
  useProblemDescriber,
  useProblemId,
  useReportProblems,
};
