import { Activity } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Plate } from "./ui/plate";

/**
 * A whole screen with nothing in it yet, the first time someone gets there. It shows a faded row of
 * what will appear, so it teaches the screen, then one sentence of why and the action that fills it.
 */
export function EmptyState({
  title,
  description,
  action,
  preview = true,
}: {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  /** The faded example row. Leave it on for a first use; turn it off where an example would mislead. */
  preview?: boolean;
}) {
  return (
    <Plate className="flex flex-col items-center px-6 pt-8 pb-9 text-center">
      {preview && (
        <div aria-hidden className="mb-7 w-full max-w-sm select-none">
          <div className="flex items-center gap-3 rounded-md bg-canvas px-4 py-3 text-start opacity-80 [mask-image:linear-gradient(to_bottom,black_40%,transparent)]">
            <span className="grid size-[34px] shrink-0 place-items-center rounded-glyph bg-tint text-tint-ink">
              <Activity size={16} strokeWidth={2} />
            </span>
            <span className="grid flex-1 gap-1.5">
              <span className="h-2.5 w-3/5 rounded-full bg-track" />
              <span className="h-2 w-2/5 rounded-full bg-track" />
            </span>
            <span className="grid w-16 gap-1.5">
              <span className="h-2 w-8 rounded-full bg-track" />
              <span className="h-1.5 w-full overflow-hidden rounded-full bg-track">
                <span className="block h-full w-3/5 rounded-full bg-primary/50" />
              </span>
            </span>
          </div>
        </div>
      )}
      <h2 className="text-xl">{title}</h2>
      <p className="mt-1.5 max-w-[44ch] text-ink-2">{description}</p>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </Plate>
  );
}

/** An empty group inside a screen, such as no API keys yet. One icon, one line of why, one action. */
export function EmptySection({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-md bg-plate px-5 py-7 text-center edge",
        className,
      )}
    >
      <span
        aria-hidden
        className="mb-2 grid size-10 place-items-center rounded-full bg-well text-ink-2 [&_svg]:size-[18px]"
      >
        {icon}
      </span>
      <h3 className="font-normal text-ink">{title}</h3>
      {description && <p className="max-w-[40ch] text-muted text-sm">{description}</p>}
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * A search or filter that matched nothing, in the list's place. Dashed, because it is temporary and
 * must never read as a plate of results. The action is the way back: Clear search, Show all.
 */
export function NoResults({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  /** Names the query or the filter: No holler matches “retro”. */
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-1.5 rounded-plate border-[1.5px] border-edge-2 border-dashed px-5 py-10 text-center">
      <span
        aria-hidden
        className="mb-2 grid size-10 place-items-center rounded-full bg-well text-ink-2 [&_svg]:size-[18px]"
      >
        {icon}
      </span>
      <h2 className="text-balance font-normal text-ink">{title}</h2>
      {description && <p className="max-w-[40ch] text-muted text-sm">{description}</p>}
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </section>
  );
}
