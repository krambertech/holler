import type { ReactNode } from "react";
import { Mark } from "./logo";
import { Plate } from "./ui/plate";

/** What a list says when it is empty: what goes here, and the one thing to do about it. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Plate className="flex flex-col items-start gap-4 px-6 py-8 sm:flex-row sm:items-center sm:gap-6">
      <Mark size={48} />
      <div className="flex-1">
        <h2 className="text-lg">{title}</h2>
        <p className="mt-1 max-w-[52ch] text-ink-2">{body}</p>
      </div>
      {action}
    </Plate>
  );
}
