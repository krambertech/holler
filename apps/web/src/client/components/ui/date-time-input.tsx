import { type ComponentProps, useId } from "react";
import { cn } from "@/lib/cn";
import { controlBase, controlSize } from "./input";

const pad = (n: number) => String(n).padStart(2, "0");
const dayValue = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
const timeValue = (at: Date) => `${pad(at.getHours())}:${pad(at.getMinutes())}`;

interface Props extends Omit<ComponentProps<"div">, "onChange" | "defaultValue"> {
  /** An instant, read and written on this browser's clock. */
  value: Date | null;
  onChange: (value: Date) => void;
  /** The earliest day the day box offers. */
  min?: Date | undefined;
  /** Visible labels over the two boxes. */
  dayLabel?: string | undefined;
  timeLabel?: string | undefined;
  invalid?: boolean | undefined;
  /** The message that says what is wrong, for the boxes' description. */
  "aria-describedby"?: string | undefined;
  disabled?: boolean | undefined;
}

/**
 * A day and a time, side by side. The browser's own date and time pickers, which suit every
 * keyboard, screen reader and phone. A half-cleared box keeps the last whole value.
 */
function DateTimeInput({
  value,
  onChange,
  min,
  dayLabel = "Day",
  timeLabel = "Time",
  invalid,
  "aria-describedby": describedBy,
  disabled,
  className,
  ...props
}: Props) {
  const id = useId();
  const day = value ? dayValue(value) : "";
  const time = value ? timeValue(value) : "";
  const commit = (nextDay: string, nextTime: string) => {
    const [y, m, d] = nextDay.split("-").map(Number);
    const [h, minute] = nextTime.split(":").map(Number);
    if (!y || !m || !d || h === undefined || minute === undefined) return;
    if (Number.isNaN(h) || Number.isNaN(minute)) return;
    onChange(new Date(y, m - 1, d, h, minute));
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
          <label htmlFor={`${id}-day`} className="text-ink-2 text-sm">
            {dayLabel}
          </label>
          <input
            id={`${id}-day`}
            type="date"
            value={day}
            min={min ? dayValue(min) : undefined}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(e) => commit(e.target.value, time || "09:00")}
            className={box}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-time`} className="text-ink-2 text-sm">
            {timeLabel}
          </label>
          <input
            id={`${id}-time`}
            type="time"
            step={300}
            value={time}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(e) => commit(day || dayValue(new Date()), e.target.value)}
            className={box}
          />
        </div>
      </div>
    </div>
  );
}

export { DateTimeInput };
