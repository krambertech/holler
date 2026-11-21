import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";
import { DrawerHeader, DrawerTitle } from "./drawer";
import { useField } from "./field";

// The row, popup, chevron, title, rule and keyboard model that Select, Combobox and Dropdown Menu share.

/** A choice or action in a list, anchored or in a drawer. */
export const listRowClassName =
  "relative flex h-11 w-full cursor-default items-center gap-2.5 rounded-sm px-2.5 text-start text-[1rem] text-ink outline-none select-none md:h-10 md:text-base data-highlighted:bg-hover data-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0";

/** A row of choices, whose highlight gives way while the pointer's fill is out: one cursor at a time. */
export const choiceRowClassName = cn(
  listRowClassName,
  "data-highlighted:text-ink [[data-hovering]_&]:data-highlighted:bg-transparent",
);

/** Pressed feedback for a row under a finger, where there is no hover. */
export const touchRowClassName = "active:bg-hover";

/** Two lines and a taller row when an option carries a description. */
export const describedRowClassName = "h-auto items-start py-2 md:h-auto [&>[aria-hidden]]:mt-1";

/** The line under an option's name, for options that each need a sentence. */
export const descriptionClassName = "block text-sm whitespace-normal text-muted";

/** Unfolds from the edge nearest the box, 4 px and scale 0.98 over 140 ms, leaving in 100. */
export const choicePopupClassName =
  "floating origin-(--transform-origin) rounded-md text-ink outline-none transition-[opacity,translate,scale] duration-140 ease-(--ease-out) data-starting-style:scale-98 data-starting-style:opacity-0 data-ending-style:scale-98 data-ending-style:opacity-0 data-ending-style:duration-100 data-[side=bottom]:data-starting-style:-translate-y-1 data-[side=bottom]:data-ending-style:-translate-y-1 data-[side=top]:data-starting-style:translate-y-1 data-[side=top]:data-ending-style:translate-y-1 motion-reduce:data-starting-style:translate-y-0 motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:translate-y-0 motion-reduce:data-ending-style:scale-100";

/** The rule between groups: out to a 4 px padded list's edge, or inset like the rows of a drawer. */
export function listSeparatorClassName(reach: "edge" | "inset", className?: string | undefined) {
  return cn(reach === "edge" ? "-mx-1" : "mx-2.5", "my-1 h-px bg-edge", className);
}

/** The box's chevron, which turns over while its list is open. */
export function TriggerChevron() {
  return (
    <ChevronDown
      className="size-4 shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none [[data-open]>&]:rotate-180 [[data-popup-open]>&]:rotate-180"
      aria-hidden="true"
    />
  );
}

/**
 * Names a list by its own `aria-label` or, inside a Field, by the Field's label. The drawer's title
 * copies that label's text each time the list opens.
 */
export function useListName(label: string | undefined, open: boolean) {
  const labelId = useField()?.labelId;
  const [labelText, setLabelText] = React.useState<string>();
  React.useLayoutEffect(() => {
    if (open && label === undefined && labelId) {
      setLabelText(document.getElementById(labelId)?.textContent ?? undefined);
    }
  }, [open, label, labelId]);
  return {
    props: label === undefined ? { "aria-labelledby": labelId } : { "aria-label": label },
    title: label ?? labelText,
  };
}

/** Letters typed within this long of each other spell one name. */
const TYPEAHEAD_MS = 600;

/**
 * The anchored list's keyboard model, for a drawer on a touch device with a keyboard attached. Rows
 * are out of the tab order. The arrows walk them and wrap at the ends, disabled rows included so a
 * screen reader still hears them; Home and End jump; typing a letter jumps to a name; Tab leaves the
 * list, which closes it.
 */
export function useDrawerListKeys(
  ref: React.RefObject<HTMLElement | null>,
  rows: string,
  close: () => void,
) {
  const typed = React.useRef({ text: "", at: 0 });
  return React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        close();
        return;
      }
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(rows) ?? []);
      if (items.length === 0) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      let to: HTMLElement | undefined;
      if (e.key === "ArrowDown") to = items[(i + 1) % items.length];
      else if (e.key === "ArrowUp") to = items[(i - 1 + items.length) % items.length];
      else if (e.key === "Home") to = items[0];
      else if (e.key === "End") to = items.at(-1);
      else if (e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // A second letter in time narrows the name; a single letter walks the matches.
        const now = Date.now();
        const text =
          (now - typed.current.at < TYPEAHEAD_MS ? typed.current.text : "") + e.key.toLowerCase();
        typed.current = { text, at: now };
        const from = text.length === 1 ? i + 1 : Math.max(i, 0);
        const order = items.map((_, k) => items[(k + from) % items.length] as HTMLElement);
        to = order.find((row) => row.textContent?.trim().toLowerCase().startsWith(text));
      }
      if (to) {
        e.preventDefault();
        to.focus();
      }
    },
    [ref, rows, close],
  );
}

/** The box's label over a drawer's list, so the sheet still says what is being chosen once it covers the form. */
export function DrawerListTitle({ children }: { children: React.ReactNode }) {
  return (
    <DrawerHeader className="ps-4.5 pt-1">
      <DrawerTitle className="text-sm font-normal text-ink-2">{children}</DrawerTitle>
    </DrawerHeader>
  );
}
