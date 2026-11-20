import type { Status } from "@holler/design";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A pill. `tint` for a count or a mode, `quiet` for a tag. */
export function Chip({
  tone = "quiet",
  className,
  children,
}: {
  tone?: "tint" | "quiet";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 font-normal text-xs",
        tone === "tint" ? "bg-tint text-tint-ink" : "bg-well text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusTone: Record<Status | "live", { chip: string; dot: string }> = {
  live: { chip: "bg-tint text-tint-ink", dot: "bg-primary" },
  answered: { chip: "bg-answered text-answered-ink", dot: "bg-answered-dot" },
  waiting: { chip: "bg-waiting text-waiting-ink", dot: "bg-waiting-dot" },
  away: { chip: "bg-away text-away-ink", dot: "bg-away-dot" },
  closed: { chip: "bg-closed text-closed-ink", dot: "bg-closed-dot" },
  danger: { chip: "bg-danger text-danger-ink", dot: "bg-danger-dot" },
};

/** A status always shows its word. Colour is never the only signal. */
export function StatusChip({ status, children }: { status: Status | "live"; children: ReactNode }) {
  const tone = statusTone[status];
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-[7px] rounded-full px-[11px] font-normal text-sm",
        tone.chip,
      )}
    >
      <StatusDot status={status} />
      {children}
    </span>
  );
}

export function StatusDot({ status, className }: { status: Status | "live"; className?: string }) {
  return (
    <i
      aria-hidden
      className={cn("inline-block size-[7px] rounded-full", statusTone[status].dot, className)}
    />
  );
}
