import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  type CalendarDay,
  compareDays,
  dayFromKey,
  dayKey,
  dayOf,
  monthWeeks,
  weekdayNames,
} from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { controlBase, controlSize } from "./input";
import { choicePopupClassName } from "./overlay-list";

const moves = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

interface Props {
  value: Date | null;
  onValueChange: (day: CalendarDay) => void;
  min?: Date | undefined;
  id?: string | undefined;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling" | undefined;
  "aria-describedby"?: string | undefined;
  className?: string | undefined;
}

function overlayLayerOf(element: HTMLElement | null): HTMLElement | undefined {
  return (
    element?.closest<HTMLElement>('[data-slot="dialog-portal"], [data-slot="drawer-portal"]') ??
    undefined
  );
}

const atDay = ({ year, month, day }: CalendarDay) => new Date(year, month, day);

function DatePickerDay({
  day,
  chosen,
  today,
  focused,
  disabled,
  onPick,
  onFocus,
}: {
  day: CalendarDay;
  chosen: boolean;
  today: boolean;
  focused: boolean;
  disabled: boolean;
  onPick: () => void;
  onFocus: () => void;
}) {
  return (
    <button
      type="button"
      data-day={dayKey(day)}
      tabIndex={focused ? 0 : -1}
      disabled={disabled}
      aria-pressed={chosen}
      aria-current={today ? "date" : undefined}
      aria-label={new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(atDay(day))}
      onClick={onPick}
      onFocus={() => {
        if (!focused) onFocus();
      }}
      className={cn(
        "relative grid size-9 place-items-center rounded-control text-sm tabular outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:text-faint",
        chosen
          ? "bg-tint font-normal text-tint-ink"
          : "text-ink hoverable:hover:not-disabled:bg-hover",
        today && !chosen && "edge-2",
      )}
    >
      {day.day}
    </button>
  );
}

function DatePickerMonth({
  chosen,
  earliest,
  onPick,
}: {
  chosen: CalendarDay | null;
  earliest: CalendarDay | null;
  onPick: (day: CalendarDay) => void;
}) {
  const today = dayOf(new Date());
  const [focused, setFocused] = useState<CalendarDay>(chosen ?? earliest ?? today);
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const shown = { year: focused.year, month: focused.month };
  const weeks = monthWeeks(shown.year, shown.month);
  const names = weekdayNames();
  const tooEarly = (day: CalendarDay) => earliest !== null && compareDays(day, earliest) < 0;
  const firstOfShown = { ...shown, day: 1 };
  const canGoBack = earliest === null || compareDays(firstOfShown, { ...earliest, day: 1 }) > 0;

  useEffect(() => {
    const button = grid.current?.querySelector<HTMLButtonElement>(
      `[data-day="${dayKey(focused)}"]`,
    );
    if (moved.current) button?.focus();
    else button?.focus({ preventScroll: true });
    moved.current = false;
  }, [focused]);

  const go = (next: CalendarDay) => {
    moved.current = true;
    setFocused(earliest && compareDays(next, earliest) < 0 ? earliest : next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!moves.has(event.key)) return;
    event.preventDefault();
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    go(dayFromKey(event.key as Parameters<typeof dayFromKey>[0], focused, rtl));
  };

  const title = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
    atDay(firstOfShown),
  );
  const step = (months: number) => go(dayFromKey(months < 0 ? "PageUp" : "PageDown", focused));

  return (
    <div data-slot="date-picker-month" className="grid gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous month"
          disabled={!canGoBack}
          onClick={() => step(-1)}
        >
          <ChevronLeft aria-hidden className="rtl:-scale-x-100" />
        </Button>
        <span aria-live="polite" className="font-normal text-ink">
          {title}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => step(1)}>
          <ChevronRight aria-hidden className="rtl:-scale-x-100" />
        </Button>
      </div>
      <div
        ref={grid}
        role="grid"
        tabIndex={-1}
        aria-label={title}
        onKeyDown={onKeyDown}
        className="grid gap-y-0.5"
      >
        <div role="row" className="grid grid-cols-7">
          {names.map((name) => (
            <span
              key={name.long}
              role="columnheader"
              aria-label={name.long}
              className="grid size-9 place-items-center text-muted text-xs"
            >
              {name.short}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={dayKey(week[0] ?? firstOfShown)} role="row" className="grid grid-cols-7">
            {week.map((day) =>
              day.inMonth ? (
                <span key={dayKey(day)} role="gridcell">
                  <DatePickerDay
                    day={day}
                    chosen={chosen !== null && compareDays(day, chosen) === 0}
                    today={compareDays(day, today) === 0}
                    focused={compareDays(day, focused) === 0}
                    disabled={tooEarly(day)}
                    onPick={() => onPick(day)}
                    onFocus={() => setFocused(day)}
                  />
                </span>
              ) : (
                <span key={dayKey(day)} role="gridcell" aria-hidden />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DatePicker({
  value,
  onValueChange,
  min,
  id,
  disabled,
  placeholder = "Pick a day",
  "aria-label": label,
  "aria-labelledby": labelledBy,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const chosen = value ? dayOf(value) : null;
  const layer = open ? overlayLayerOf(trigger.current) : undefined;
  const shown = value
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(value)
    : placeholder;
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        ref={trigger}
        id={id}
        data-slot="date-picker"
        disabled={disabled}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={cn(
          controlBase,
          controlSize,
          "inline-flex items-center justify-between gap-2 px-3.5 text-start tabular outline-none data-popup-open:edge-2",
          !value && "text-muted",
          className,
        )}
      >
        <span className="truncate">{shown}</span>
        <CalendarDays aria-hidden className="size-4 shrink-0 text-muted" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={layer}>
        <PopoverPrimitive.Positioner
          positionMethod="fixed"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="isolate z-(--z-dropdown)"
        >
          <PopoverPrimitive.Popup data-slot="date-picker-content" className={choicePopupClassName}>
            <DatePickerMonth
              chosen={chosen}
              earliest={min ? dayOf(min) : null}
              onPick={(day) => {
                onValueChange(day);
                setOpen(false);
              }}
            />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export { DatePicker };
