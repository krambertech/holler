import { Clock } from "lucide-react";
import { type ComponentProps, useId, useMemo, useRef, useState } from "react";
import { dayKey } from "@/lib/calendar";
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
import { DatePicker } from "./date-picker";
import { FieldItems, useField, useFieldControl } from "./field";

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
    if (!query.trim() && value && !options.some((o) => timeKey(o) === timeKey(value))) {
      return [...options, value].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    }
    return options;
  }, [query, value]);
  const typed = query.trim() ? parseTimeOfDay(query) : null;
  return (
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
        autoHighlight={Boolean(typed)}
        isItemEqualToValue={(a, b) => timeKey(a) === timeKey(b)}
        itemToStringLabel={timeKey}
        disabled={disabled}
        onOpenChange={(open) => {
          if (!open) setQuery("");
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
  value?: Date | null | undefined;
  defaultValue?: Date | null | undefined;
  onValueChange?: ((value: Date) => void) | undefined;
  min?: Date | undefined;
  dayLabel?: string | undefined;
  timeLabel?: string | undefined;
  inline?: boolean | undefined;
  id?: string | undefined;
  disabled?: boolean | undefined;
}

function DateTimeInput({
  value: valueProp,
  defaultValue = null,
  onValueChange,
  min,
  dayLabel = "Day",
  timeLabel = "Time",
  inline = false,
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
  const label = cn("text-ink-2 text-sm", inline && "sr-only");
  return (
    <div
      data-slot="date-time-input"
      className={cn(inline ? "w-auto" : "@container w-full max-w-sm", className)}
      {...props}
    >
      <div
        className={cn(
          "grid gap-3",
          inline
            ? "grid-cols-[minmax(0,9.5rem)_minmax(0,7rem)] gap-2"
            : "@[18rem]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]",
        )}
      >
        <div className="grid gap-1.5">
          <label htmlFor={dayId} className={label}>
            {dayLabel}
          </label>
          <DatePicker
            id={dayId}
            value={value}
            min={min}
            disabled={disabled}
            aria-invalid={a11y["aria-invalid"]}
            aria-describedby={a11y["aria-describedby"]}
            onValueChange={(picked) => commit(dayKey(picked), time ?? { hour: 9, minute: 0 })}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={timeId} className={label}>
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
