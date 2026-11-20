import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * The white rounded surface everything sits on. Rows that belong together share one plate with a
 * hairline between them, and a tinted strip can close it. Depth is the hairline edge, never a shadow.
 */
export function Plate({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-plate bg-plate shadow-[0_0_0_1px_var(--edge)]",
        className,
      )}
      {...rest}
    />
  );
}

/** A row inside a plate. Every row after the first draws the divider above itself. */
export function PlateRow({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-divider border-t first:border-t-0", className)} {...rest} />;
}

/** The tinted strip that closes a plate: "9 people still to answer". */
export function PlateStrip({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-tint px-5 py-3 font-normal text-tint-ink",
        className,
      )}
      {...rest}
    />
  );
}
