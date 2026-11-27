import { type RefObject, useLayoutEffect, useState } from "react";

export interface ChipOverflow {
  shown: number;
  hidden: number;
  rowBottom: number;
  moreAt: number | null;
  side: "left" | "right";
}

const MORE_WIDTH = 88;
const GAP = 6;

const none: ChipOverflow = { shown: 0, hidden: 0, rowBottom: 0, moreAt: null, side: "left" };

function endOf(chip: HTMLElement, field: HTMLElement, rtl: boolean): number {
  return rtl ? field.clientWidth - chip.offsetLeft : chip.offsetLeft + chip.offsetWidth;
}

function measure(field: HTMLElement): ChipOverflow {
  const chips = [...field.querySelectorAll<HTMLElement>("[data-slot=audience-chip]")];
  const first = chips[0];
  if (!first) return none;
  const rtl = getComputedStyle(field).direction === "rtl";
  const side = rtl ? "right" : "left";
  const top = first.offsetTop;
  const rowBottom = top + first.offsetHeight;
  const rowOne = chips.filter((chip) => chip.offsetTop === top);
  if (rowOne.length === chips.length) {
    return { shown: chips.length, hidden: 0, rowBottom, moreAt: null, side };
  }
  const limit = field.clientWidth - MORE_WIDTH;
  let shown = rowOne.length;
  while (shown > 1) {
    const last = rowOne[shown - 1];
    if (!last || endOf(last, field, rtl) <= limit) break;
    shown -= 1;
  }
  const last = rowOne[shown - 1] ?? first;
  return {
    shown,
    hidden: chips.length - shown,
    rowBottom,
    moreAt: endOf(last, field, rtl) + GAP,
    side,
  };
}

export function useChipOverflow(
  field: RefObject<HTMLElement | null>,
  chipCount: number,
): ChipOverflow {
  const [overflow, setOverflow] = useState<ChipOverflow>(none);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const update = () => {
      const next = measure(el);
      setOverflow((previous) =>
        previous.shown === next.shown &&
        previous.rowBottom === next.rowBottom &&
        previous.moreAt === next.moreAt &&
        previous.hidden === next.hidden &&
        previous.side === next.side
          ? previous
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [field, chipCount]);
  return overflow;
}
