import { type ComponentProps, useId } from "react";
import { cn } from "@/lib/cn";
import { useControllableState } from "@/lib/use-controllable-state";
import { useFieldControl } from "./field";
import { controlBase, controlSize } from "./input";

const pad = (n: number) => String(n).padStart(2, "0");
const dayValue = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
const timeValue = (at: Date) => `${pad(at.getHours())}:${pad(at.getMinutes())}`;

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
 * A day and a time, side by side. The browser's own date and time pickers, which suit every
 * keyboard, screen reader and phone. A half-cleared box keeps the last whole value. Inside a Field,
 * both boxes take the Field's description and invalid state.
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
  disabled,
  className,
  ...props
}: Props) {
  const own = useId();
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
  const time = value ? timeValue(value) : "";
  const commit = (nextDay: string, nextTime: string) => {
    const [y, m, d] = nextDay.split("-").map(Number);
    const [h, minute] = nextTime.split(":").map(Number);
    if (!y || !m || !d || h === undefined || minute === undefined) return;
    if (Number.isNaN(h) || Number.isNaN(minute)) return;
    setValue(new Date(y, m - 1, d, h, minute));
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
            onChange={(e) => commit(e.target.value, time || "09:00")}
            className={box}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={timeId} className="text-ink-2 text-sm">
            {timeLabel}
          </label>
          <input
            id={timeId}
            type="time"
            step={300}
            value={time}
            disabled={disabled}
            aria-invalid={a11y["aria-invalid"]}
            aria-describedby={a11y["aria-describedby"]}
            onChange={(e) => commit(day || dayValue(new Date()), e.target.value)}
            className={box}
          />
        </div>
      </div>
    </div>
  );
}

export { DateTimeInput };
