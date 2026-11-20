import type { Mode } from "@holler/core";
import { modeLabels } from "@holler/core";
import { Activity, FileCheck2, ListChecks } from "lucide-react";
import { cn } from "@/lib/cn";

const icons = { pulse: Activity, survey: ListChecks, chase: FileCheck2 } as const;

/** The recurring identity unit of a row: the mode's icon on a tint tile. Quiet once a Holler is not live. */
export function ModeGlyph({ mode, quiet = false }: { mode: Mode; quiet?: boolean }) {
  const Icon = icons[mode];
  return (
    <span
      role="img"
      aria-label={modeLabels[mode]}
      className={cn(
        "grid size-[38px] shrink-0 place-items-center rounded-glyph",
        quiet ? "bg-well text-muted" : "bg-tint text-tint-ink",
      )}
    >
      <Icon aria-hidden size={18} strokeWidth={2} />
    </span>
  );
}
