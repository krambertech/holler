import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

interface Props extends ComponentProps<"span"> {
  /** 0 to 1. */
  value: number;
}

/**
 * A thin completion bar. The count beside it carries the meaning, so screen readers skip it. The fill
 * scales from the start edge rather than animating width, so it never reflows.
 */
function ProgressBar({ value, className, ...props }: Props) {
  const share = Math.min(1, Math.max(0, value));
  return (
    <span
      aria-hidden
      data-slot="progress"
      className={cn("block h-1.5 overflow-hidden rounded-full bg-track", className)}
      {...props}
    >
      <span
        className="block h-full w-full origin-left rounded-full bg-primary transition-transform duration-250 rtl:origin-right"
        style={{ transform: `scaleX(${share})` }}
      />
    </span>
  );
}

export { ProgressBar };
