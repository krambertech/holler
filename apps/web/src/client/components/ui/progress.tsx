import { cn } from "@/lib/cn";

/** A thin completion bar. The numbers beside it carry the meaning; the bar is for the eye. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <span
      aria-hidden
      className={cn("block h-1.5 overflow-hidden rounded-full bg-track", className)}
    >
      <span
        className="block h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
