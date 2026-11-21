import type { Mode } from "@holler/core";
import { modeLabels } from "@holler/core";
import { Activity, ExternalLink, ListChecks } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const icons = { pulse: Activity, survey: ListChecks, chase: ExternalLink } as const;

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
