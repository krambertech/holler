import { cn } from "@/lib/cn";
import type { FluidHover } from "@/lib/fluid-hover";

interface FluidHighlightProps {
  hover: FluidHover;
  className?: string | undefined;
}

/**
 * The one hover fill behind a list's items. Put it first inside the measured container, which
 * must be positioned, and give the items `relative` so they paint over it.
 */
export function FluidHighlight({ hover, className }: FluidHighlightProps) {
  if (!hover.rect) return null;
  const { x, y, width, height } = hover.rect;
  return (
    <div
      key={hover.enters}
      aria-hidden="true"
      data-hidden={hover.shown ? undefined : ""}
      className={cn(
        // check-styling: allow: the measured x runs from the container's physical left edge, in either direction.
        "fluid-highlight pointer-events-none absolute left-0 top-0 rounded-sm bg-hover",
        className,
      )}
      style={{ width, height, translate: `${x}px ${y}px` }}
    />
  );
}
