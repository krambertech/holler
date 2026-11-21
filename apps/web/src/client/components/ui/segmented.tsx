import { Tabs } from "@base-ui/react/tabs";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SegmentedProps<T extends string> extends Omit<
  ComponentProps<typeof Tabs.Root>,
  "value" | "defaultValue" | "onValueChange" | "className"
> {
  value?: T | undefined;
  defaultValue?: T | undefined;
  onValueChange?: ((value: T) => void) | undefined;
  /** Names the set of views: "Whose hollers". */
  "aria-label": string;
  className?: string | undefined;
  children: ReactNode;
}

/**
 * Two or three views of one list: Mine and Shared with me. The chosen view is a white plate that
 * slides to the item you pick. Arrow keys move between items.
 */
function Segmented<T extends string>({
  onValueChange,
  "aria-label": label,
  className,
  children,
  ...props
}: SegmentedProps<T>) {
  return (
    <Tabs.Root
      {...props}
      onValueChange={onValueChange ? (next) => onValueChange(next as T) : undefined}
      data-slot="segmented"
    >
      <Tabs.List
        aria-label={label}
        className={cn(
          "relative inline-flex gap-0.5 rounded-md bg-track p-[3px] text-base",
          className,
        )}
      >
        <Tabs.Indicator
          // check-styling: allow: Base UI measures --active-tab-left from the physical left, in RTL too.
          className="absolute top-(--active-tab-top) left-0 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) rounded-[9px] bg-plate edge transition-[translate,width] duration-250 ease-out"
        />
        {children}
      </Tabs.List>
    </Tabs.Root>
  );
}

interface SegmentedItemProps extends Omit<ComponentProps<typeof Tabs.Tab>, "className"> {
  value: string;
  /** A count beside the label. Pass `null` while it loads, so the space is held and nothing jumps. */
  count?: number | null | undefined;
  className?: string | undefined;
}

function SegmentedItem({ count, className, children, ...props }: SegmentedItemProps) {
  return (
    <Tabs.Tab
      {...props}
      data-slot="segmented-item"
      className={cn(
        "relative z-10 rounded-[9px] px-3.5 py-[7px] text-muted transition-colors duration-200 hoverable:hover:text-ink data-[active]:text-ink",
        "pointer-coarse:before:absolute pointer-coarse:before:-inset-y-1 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']",
        className,
      )}
    >
      {children}
      {count !== undefined && (
        <span className="ms-1.5 inline-block min-w-[2ch] text-start text-muted tabular">
          {count ?? ""}
        </span>
      )}
    </Tabs.Tab>
  );
}

export { Segmented, SegmentedItem };
