import { type ReactNode, useId } from "react";
import { DateTimeInput } from "@/components/ui/date-time-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import type { DirectoryGroup, DirectorySearch } from "./directory";
import { fromPicker, nextWholeHour, toPicker } from "./picker-time";
import { SendDialogChannel } from "./send-dialog-channel";
import {
  closePresets,
  closeSummary,
  closeTime,
  openHours,
  remindersSummary,
  type SendFields,
  sendWindow,
  type ZoneCount,
} from "./send-logic";

export interface SendContext {
  now: Date;
  senderZone: string;
  zones: ZoneCount[];
}

interface RowProps {
  label: string;
  description: ReactNode;
  tone?: "danger" | "warning" | undefined;
  control: (ids: { label: string; description: string }) => ReactNode;
  children?: ReactNode | undefined;
}

const toneText = {
  neutral: "text-muted",
  warning: "text-waiting-ink",
  danger: "text-danger-ink",
} as const;

function SendDialogRow({ label, description, tone, control, children }: RowProps) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div
      data-slot="send-dialog-row"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5"
    >
      <span className="grid min-w-44 flex-1 gap-0.5">
        <span id={labelId} className="font-normal text-ink">
          {label}
        </span>
        <span id={descriptionId} className={cn("text-pretty text-sm", toneText[tone ?? "neutral"])}>
          {description}
        </span>
      </span>
      {control({ label: labelId, description: descriptionId })}
      {children && <div className="basis-full">{children}</div>}
    </div>
  );
}

const fixed = "fixed";

const closeItems = [
  ...closePresets.map((preset) => ({
    value: String(preset.hours),
    label: `After ${preset.label}`,
  })),
  { value: fixed, label: "On a day you pick" },
];

function sentence(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

interface Props {
  value: SendFields;
  onChange: (patch: Partial<SendFields>) => void;
  context: SendContext;
  closeProblem?: string | undefined;
  counting: boolean;
  onCounting: (on: boolean) => void;
  channel: DirectoryGroup | null;
  onChannel: (channel: DirectoryGroup) => void;
  channelProblem?: string | undefined;
  search: DirectorySearch;
  before?: ReactNode | undefined;
}

function SendDialogRows({
  value,
  onChange,
  context,
  closeProblem,
  counting,
  onCounting,
  channel,
  onChannel,
  channelProblem,
  search,
  before,
}: Props) {
  const { now, senderZone, zones } = context;
  const reminders = remindersSummary(value.remindersEnabled, openHours(value, context));
  const close = closeSummary(value, context, closeProblem);
  const window = sendWindow({
    sendAt: value.sendAt,
    inRecipientTimeZone: value.sendInRecipientTimeZone,
    senderZone,
    zones,
    now,
  });
  const pick = value.closesAt ? fixed : String(value.closeAfterHours);
  const closeTone = close.tone === "danger" || close.tone === "warning" ? close.tone : undefined;

  return (
    <div
      data-slot="send-dialog-rows"
      className="grid divide-y divide-divider border-divider border-y"
    >
      {before}
      <SendDialogRow
        label="Reminders"
        description={sentence(reminders.description)}
        control={(ids) => (
          <Switch
            aria-labelledby={ids.label}
            aria-describedby={ids.description}
            checked={value.remindersEnabled}
            onCheckedChange={(remindersEnabled) => onChange({ remindersEnabled })}
          />
        )}
      />
      <SendDialogRow
        label="Closes"
        description={value.closesAt ? `${close.value}, ${close.description}` : `${close.value}`}
        tone={closeTone}
        control={(ids) => (
          <Select
            value={pick}
            items={closeItems}
            onValueChange={(next) =>
              onChange(
                next === fixed
                  ? { closesAt: nextWholeHour(closeTime(value, window), senderZone) }
                  : { closesAt: null, closeAfterHours: Number(next) },
              )
            }
          >
            <SelectTrigger
              aria-labelledby={ids.label}
              aria-describedby={ids.description}
              className="w-auto"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent aria-label="When it closes">
              {closeItems.map((item) => (
                <SelectItem key={item.value} value={item.value} indicator="end">
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      >
        {value.closesAt && (
          <DateTimeInput
            inline
            className="ms-auto w-fit"
            dayLabel="Day it closes"
            timeLabel="Time it closes"
            value={toPicker(value.closesAt, senderZone)}
            min={toPicker(value.sendAt ?? now, senderZone)}
            onValueChange={(picked) => onChange({ closesAt: fromPicker(picked, senderZone) })}
            aria-invalid={close.tone === "danger" || undefined}
          />
        )}
      </SendDialogRow>
      <SendDialogRow
        label="Live count"
        description={channelProblem ?? "Posts how many have answered in a channel, never who"}
        tone={channelProblem ? "danger" : undefined}
        control={(ids) => (
          <Switch
            aria-labelledby={ids.label}
            aria-describedby={ids.description}
            checked={counting}
            onCheckedChange={onCounting}
          />
        )}
      >
        {counting && <SendDialogChannel channel={channel} search={search} onChannel={onChannel} />}
      </SendDialogRow>
    </div>
  );
}

export { SendDialogRow, SendDialogRows };
