import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Two or three tabs on a track: Mine and Shared with me. The chosen one is a white plate. */
export function Segmented<T extends string>({
  value,
  onValueChange,
  items,
  label,
}: {
  value: T;
  onValueChange: (value: T) => void;
  items: { value: T; label: ReactNode; count?: number }[];
  label: string;
}) {
  return (
    <Tabs.Root value={value} onValueChange={(next) => onValueChange(next as T)}>
      <Tabs.List
        aria-label={label}
        className="inline-flex gap-0.5 rounded-[14px] bg-track p-[3px] text-md"
      >
        {items.map((item) => (
          <Tabs.Tab
            key={item.value}
            value={item.value}
            className={cn(
              "rounded-[11px] px-3.5 py-[7px] text-muted transition-colors hover:text-ink",
              "data-[active]:bg-plate data-[active]:font-normal data-[active]:text-ink data-[active]:shadow-[0_0_0_1px_var(--edge)]",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="ms-1.5 text-muted tabular">{item.count}</span>
            )}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
