import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./ui/button";

/**
 * Something failed to load. It says what failed, what to do, and offers Try again. A reference code,
 * when there is one, sits small at the bottom so a person can quote it to support.
 */
export function ErrorState({
  title,
  description = "Check your connection and try again. If it keeps happening, it is on our side and we are on it.",
  onRetry,
  pending = false,
  action,
  reference,
  className,
}: {
  /** What failed, in the person's words: “We could not load your hollers”. */
  title: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  pending?: boolean;
  /** A second way out beside Try again, such as Back to your hollers. */
  action?: ReactNode;
  reference?: string;
  className?: string;
}) {
  return (
    <section
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-plate bg-plate px-6 py-9 text-center edge",
        className,
      )}
    >
      <span
        aria-hidden
        className="mb-3 grid size-10 place-items-center rounded-full bg-danger text-danger-ink"
      >
        <CircleAlert size={20} strokeWidth={2} />
      </span>
      <h2 className="text-balance text-lg">{title}</h2>
      <p className="mt-1 max-w-[46ch] text-ink-2">{description}</p>
      {(onRetry || action) && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onRetry && (
            <Button onClick={onRetry} pending={pending}>
              Try again
            </Button>
          )}
          {action}
        </div>
      )}
      {reference && <p className="mt-5 font-mono text-muted text-xs">Reference {reference}</p>}
    </section>
  );
}
