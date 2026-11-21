import type { Status } from "@holler/design";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

interface ChipProps extends ComponentProps<"span"> {
  /** `tint` for a count, a mode or a send time; `quiet` for a tag. */
  variant?: "tint" | "quiet" | undefined;
}

/** A pill. Two variants, nothing else. A status uses StatusChip, which always carries its word. */
function Chip({ variant = "quiet", className, ...props }: ChipProps) {
  return (
    <span
      data-slot="chip"
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 font-normal text-xs",
        variant === "tint" ? "bg-tint text-tint-ink" : "bg-well text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

type ChipStatus = Status | "live";

const statusTone: Record<ChipStatus, { chip: string; dot: string }> = {
  live: { chip: "bg-live text-live-ink", dot: "bg-live-dot" },
  answered: { chip: "bg-answered text-answered-ink", dot: "bg-answered-dot" },
  waiting: { chip: "bg-waiting text-waiting-ink", dot: "bg-waiting-dot" },
  away: { chip: "bg-away text-away-ink", dot: "bg-away-dot" },
  closed: { chip: "bg-closed text-closed-ink", dot: "bg-closed-dot" },
  danger: { chip: "bg-danger text-danger-ink", dot: "bg-danger-dot" },
};

interface StatusChipProps extends ComponentProps<"span"> {
  /**
   * Live for out and calling; answered, waiting and away for a person; closed for anything that is
   * not taking answers, including scheduled and draft; danger only when something failed.
   */
  status: ChipStatus;
}

/** A status always shows its word. Colour is never the only signal. */
function StatusChip({ status, className, children, ...props }: StatusChipProps) {
  return (
    <span
      data-slot="status-chip"
      className={cn(
        "inline-flex h-7 items-center gap-[7px] rounded-full px-[11px] font-normal text-sm",
        statusTone[status].chip,
        className,
      )}
      {...props}
    >
      <StatusDot status={status} />
      {children}
    </span>
  );
}

interface StatusDotProps extends ComponentProps<"i"> {
  status: ChipStatus;
}

function StatusDot({ status, className, ...props }: StatusDotProps) {
  return (
    <i
      aria-hidden
      data-slot="status-dot"
      className={cn("inline-block size-[7px] rounded-full", statusTone[status].dot, className)}
      {...props}
    />
  );
}

export { Chip, StatusChip, StatusDot };
