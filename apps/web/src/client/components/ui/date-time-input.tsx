import { Clock } from "lucide-react";
import { type ComponentProps, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { parseTimeOfDay, type TimeOfDay, timeKey, timeOptions } from "@/lib/time-of-day";
import { useControllableState } from "@/lib/use-controllable-state";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "./combobox";
import { FieldItems, useField, useFieldControl } from "./field";
import { controlBase, controlSize } from "./input";

const pad = (n: number) => String(n).padStart(2, "0");
const dayValue = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;

interface TimePickerProps {
  id: string;
  label: string;
  value: TimeOfDay | null;
  onValueChange: (value: TimeOfDay) => void;
  disabled?: boolean | undefined;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling" | undefined;
  "aria-describedby"?: string | undefined;
}

/**
 * A time from a list in 15-minute steps, or any minute typed: "9:30", "930", "9pm". Holler's own
 * list, since the browser's time box paints its parts in the system's colours.
 */
function TimePicker({
  id,
  label,
  value,
  onValueChange,
  disabled,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
}: TimePickerProps) {
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const items = useMemo(() => {
    const options = timeOptions(query);
    // A chosen time off the steps keeps its row in the full list, so its tick has somewhere to sit.
    if (!query.trim() && value && !options.some((o) => timeKey(o) === timeKey(value))) {
      return [...options, value].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    }
    return options;
  }, [query, value]);
  const typed = query.trim() ? parseTimeOfDay(query) : null;
  return (
    // The Field around the whole input names the day box; this list answers to its own label.
    <FieldItems>
      <Combobox<TimeOfDay>
        items={items}
        filter={null}
        value={value}
        onValueChange={(next) => {
          if (next) onValueChange(next);
        }}
        inputValue={query}
        onInputValueChange={setQuery}
        // Enter takes a row only once something is typed, never the top of the day by accident.
        autoHighlight={Boolean(typed)}
        isItemEqualToValue={(a, b) => timeKey(a) === timeKey(b)}
        itemToStringLabel={timeKey}
        disabled={disabled}
        onOpenChange={(open) => {
          if (!open) setQuery("");
          // Open on the chosen time, not at midnight.
          else
            requestAnimationFrame(() =>
              list.current?.querySelector("[data-selected]")?.scrollIntoView({ block: "center" }),
            );
        }}
      >
        <ComboboxTrigger
          id={id}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="tabular"
        >
          <ComboboxValue placeholder="Pick a time" />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput
            aria-label={label}
            icon={Clock}
            inputMode="text"
            placeholder="Type a time, like 9:30"
          />
          <ComboboxEmpty>
            {items.length === 0 ? "That is not a time. Try 9:30 or 21:00." : null}
          </ComboboxEmpty>
          <ComboboxList ref={list}>
            {(time: TimeOfDay) => (
              <ComboboxItem key={timeKey(time)} value={time}>
                <span className="tabular">{timeKey(time)}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </FieldItems>
  );
}

interface Props extends Omit<ComponentProps<"div">, "onChange" | "defaultValue"> {
  /** An instant, read and written on this browser's clock. Leave undefined to let the input keep its own. */
  value?: Date | null | undefined;
  defaultValue?: Date | null | undefined;
  onValueChange?: ((value: Date) => void) | undefined;
  /** The earliest day the day box offers. */
  min?: Date | undefined;
  /** Visible labels over the two boxes. */
  dayLabel?: string | undefined;
  timeLabel?: string | undefined;
  /** The id of the day box, which a `FieldLabel` points at. Inside a Field it comes from the Field. */
  id?: string | undefined;
  disabled?: boolean | undefined;
}

/**
 * A day and a time, side by side. The day is the browser's own date box, which every keyboard,
 * screen reader and phone knows; the time is Holler's list in 15-minute steps that also takes any
 * minute typed. A half-cleared day keeps the last whole value. Inside a Field, both take the
 * Field's description, invalid and disabled state.
 */
function DateTimeInput({
  value: valueProp,
  defaultValue = null,
  onValueChange,
  min,
  dayLabel = "Day",
  timeLabel = "Time",
  id: idProp,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  disabled: disabledProp,
  className,
  ...props
}: Props) {
  const own = useId();
  const field = useField();
  const disabled = disabledProp || field?.disabled;
  const a11y = useFieldControl({
    id: idProp,
    "aria-describedby": describedBy,
    "aria-invalid": invalid,
  });
  const dayId = a11y.id ?? `${own}-day`;
  const timeId = `${own}-time`;
  const [value, setValue] = useControllableState<Date | null, []>({
    value: valueProp,
    defaultValue,
    onChange: (next) => {
      if (next) onValueChange?.(next);
    },
  });
  const day = value ? dayValue(value) : "";
  const time: TimeOfDay | null = value
    ? { hour: value.getHours(), minute: value.getMinutes() }
    : null;
  const commit = (nextDay: string, nextTime: TimeOfDay) => {
    const [y, m, d] = nextDay.split("-").map(Number);
    if (!y || !m || !d) return;
    setValue(new Date(y, m - 1, d, nextTime.hour, nextTime.minute));
  };
  const box = cn(controlBase, controlSize, "px-3.5 tabular");
  return (
    // Side by side where there is room, one over the other in a narrow row on a phone.
    <div
      data-slot="date-time-input"
      className={cn("@container w-full max-w-sm", className)}
      {...props}
    >
      <div className="grid gap-3 @[18rem]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid gap-1.5">
          <label htmlFor={dayId} className="text-ink-2 text-sm">
            {dayLabel}
          </label>
          <input
            id={dayId}
            type="date"
            value={day}
            min={min ? dayValue(min) : undefined}
            disabled={disabled}
            aria-invalid={a11y["aria-invalid"]}
            aria-describedby={a11y["aria-describedby"]}
            onChange={(e) => commit(e.target.value, time ?? { hour: 9, minute: 0 })}
            className={box}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={timeId} className="text-ink-2 text-sm">
            {timeLabel}
          </label>
          <TimePicker
            id={timeId}
            label={timeLabel}
            value={time}
            disabled={disabled}
            aria-invalid={a11y["aria-invalid"]}
            aria-describedby={a11y["aria-describedby"]}
            onValueChange={(next) => commit(day || dayValue(new Date()), next)}
          />
        </div>
      </div>
    </div>
  );
}

export { DateTimeInput };
