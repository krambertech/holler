import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * The white rounded surface everything sits on. Rows that belong together share one plate with a
 * hairline between them, and a tinted strip can close it. Depth is the hairline edge, never a shadow.
 */
function Plate({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="plate"
      className={cn("overflow-hidden rounded-plate bg-plate edge", className)}
      {...props}
    />
  );
}

/** A row inside a plate. Every row after the first draws the divider above itself. */
function PlateRow({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="plate-row"
      className={cn("border-divider border-t first:border-t-0", className)}
      {...props}
    />
  );
}

/** The tinted strip that closes a plate: "9 people still to answer". */
function PlateStrip({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="plate-strip"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-tint px-5 py-3 font-normal text-tint-ink",
        className,
      )}
      {...props}
    />
  );
}

export { Plate, PlateRow, PlateStrip };
