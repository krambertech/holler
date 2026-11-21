import type { Mode } from "@holler/core";
import { modeLabels } from "@holler/core";
import { Activity, ListChecks, type LucideProps } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * A running figure for a chase: Holler goes after everyone until the form is in. Lucide has none,
 * so this is Tabler's "run" (MIT), drawn on Lucide's 24 px grid with its round 2 px stroke.
 */
function RunningFigure({ size = 24, strokeWidth = 2, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="13" cy="4" r="1" />
      <path d="M4 17l5 1l.75 -1.5" />
      <path d="M15 21l0 -4l-4 -3l1 -6" />
      <path d="M7 12l0 -3l5 -1l3 3l3 1" />
    </svg>
  );
}

/** Each mode's icon, for anywhere a mode is named beside its glyph. */
export const modeIcons = { pulse: Activity, survey: ListChecks, chase: RunningFigure } as const;
const icons = modeIcons;

/** The recurring identity unit of a row: the mode's icon on a tint tile. Quiet once a Holler is not live. */
interface Props extends ComponentProps<"span"> {
  mode: Mode;
  /** Quiet once a Holler is not live. */
  quiet?: boolean | undefined;
}

export function ModeGlyph({ mode, quiet = false, className, ...props }: Props) {
  const Icon = icons[mode];
  return (
    <span
      {...props}
      role="img"
      aria-label={modeLabels[mode]}
      className={cn(
        "grid size-[38px] shrink-0 place-items-center rounded-glyph",
        quiet ? "bg-well text-muted" : "bg-tint text-tint-ink",
        className,
      )}
    >
      <Icon aria-hidden size={18} strokeWidth={2} />
    </span>
  );
}
