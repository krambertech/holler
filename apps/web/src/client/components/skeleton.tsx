import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Holds the shape of what is loading. Give it the loaded size. A slow sheen, still under reduced motion. */
function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      data-slot="skeleton"
      className={cn("skeleton rounded-sm", className)}
      {...props}
    />
  );
}

export { Skeleton };
