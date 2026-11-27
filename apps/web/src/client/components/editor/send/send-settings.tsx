import { TriangleAlert } from "lucide-react";
import { type ComponentProps, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Plate } from "@/components/ui/plate";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/cn";
import { count } from "@/lib/format";
import { useControllableState } from "@/lib/use-controllable-state";
import { type DirectoryGroup, type DirectorySearch, searchDirectory } from "./directory";
import { fromPicker, nextWholeHour, toPicker } from "./picker-time";
import {
  anonymousWarning,
  answersSummary,
  closePresets,
  closeSummary,
  closeTime,
  openHours,
  type Reach,
  remindersSummary,
  type SendFields,
  sendWindow,
  type ZoneCount,
} from "./send-logic";
import { SendSettingsChannel } from "./send-settings-channel";
import { SendSettingsRow, SendSettingsSwitchRow } from "./send-settings-rows";
import { SendSettingsTags } from "./send-settings-tags";
import { useNow } from "./use-now";

export type SettingsRowId = "close" | "announce" | "tags";
type Row = SettingsRowId;

const fresh: SendFields = {
  sendAt: null,
  sendInRecipientTimeZone: false,
  closesAt: null,
  closeAfterHours: 72,
  anonymous: false,
  remindersEnabled: true,
  announceChannelId: null,
  tags: [],
};

interface Props extends Omit<ComponentProps<"section">, "defaultValue"> {
  value?: SendFields | undefined;
  defaultValue?: SendFields | undefined;
  onValueChange?: ((value: SendFields) => void) | undefined;
  problems?: { closesAt?: string | undefined } | undefined;
  reach: Reach;
  zones?: ZoneCount[] | undefined;
  tagSuggestions?: string[] | undefined;
  knownChannels?: DirectoryGroup[] | undefined;
  search?: DirectorySearch | undefined;
  now?: Date | undefined;
  timeZone?: string | undefined;
  openRow?: Row | null | undefined;
  defaultOpenRow?: Row | null | undefined;
  onOpenRowChange?: ((row: Row | null) => void) | undefined;
}

interface RowsProps {
  value: SendFields;
  onChange: (patch: Partial<SendFields>) => void;
  context: { now: Date; senderZone: string; zones: ZoneCount[] };
  closeProblem: string | undefined;
  open: Row | null;
  setOpen: (row: Row | null) => void;
  channel: DirectoryGroup | null;
  onChannel: (channel: DirectoryGroup) => void;
  tagSuggestions: string[];
  search: DirectorySearch;
}

function CloseChoice({
  value,
  onChange,
  context,
}: Pick<RowsProps, "value" | "onChange" | "context">) {
  const { now, senderZone, zones } = context;
  const window = sendWindow({
    sendAt: value.sendAt,
    inRecipientTimeZone: value.sendInRecipientTimeZone,
    senderZone,
    zones,
    now,
  });
  const pick = value.closesAt ? "fixed" : String(value.closeAfterHours);
  const isPreset = closePresets.some((p) => String(p.hours) === pick);
  const close = closeSummary(value, context);
  return (
    <>
      <RadioGroup
        aria-label="When it closes"
        value={isPreset || pick === "fixed" ? pick : ""}
        onValueChange={(next) =>
          onChange(
            next === "fixed"
              ? { closesAt: nextWholeHour(closeTime(value, window), senderZone) }
              : { closesAt: null, closeAfterHours: Number(next) },
          )
        }
        className="gap-2.5"
      >
        {closePresets.map((preset) => (
          <Field key={preset.hours} orientation="horizontal">
            <RadioGroupItem value={String(preset.hours)} />
            <FieldLabel>
              {window.first.getTime() === window.last.getTime()
                ? `${preset.label} after it sends`
                : `${preset.label} after the last person gets it`}
            </FieldLabel>
          </Field>
        ))}
        <Field orientation="horizontal">
          <RadioGroupItem value="fixed" />
          <FieldLabel>On a day and time you pick</FieldLabel>
        </Field>
      </RadioGroup>
      {value.closesAt && (
        <DateTimeInput
          value={toPicker(value.closesAt, senderZone)}
          min={toPicker(value.sendAt ?? now, senderZone)}
          onValueChange={(picked) => onChange({ closesAt: fromPicker(picked, senderZone) })}
          aria-invalid={close.tone === "danger" || undefined}
        />
      )}
    </>
  );
}

function tagsValue(tags: string[], open: boolean) {
  if (tags.length === 0) return undefined;
  if (open) return tags.length === 1 ? "1 tag" : `${count(tags.length)} tags`;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Chip key={tag}>{tag}</Chip>
      ))}
    </span>
  );
}

function SettingsRows({
  value,
  onChange,
  context,
  closeProblem,
  open,
  setOpen,
  channel,
  onChannel,
  tagSuggestions,
  search,
}: RowsProps) {
  const toggle = (row: Row) => setOpen(open === row ? null : row);
  const announceId = value.announceChannelId;
  const tagsOpen = open === "tags";
  return (
    <>
      <SendSettingsRow
        label="Closes"
        summary={closeSummary(value, context, closeProblem)}
        action={open === "close" ? "Done" : "Change"}
        open={open === "close"}
        onToggle={() => toggle("close")}
      >
        <CloseChoice value={value} onChange={onChange} context={context} />
      </SendSettingsRow>
      <SendSettingsSwitchRow
        label="Answers"
        summary={answersSummary(value.anonymous)}
        checked={value.anonymous}
        onCheckedChange={(anonymous) => onChange({ anonymous })}
        switchLabel="Anonymous answers"
      />
      <SendSettingsSwitchRow
        label="Reminders"
        summary={remindersSummary(value.remindersEnabled, openHours(value, context))}
        checked={value.remindersEnabled}
        onCheckedChange={(remindersEnabled) => onChange({ remindersEnabled })}
        switchLabel="Remind people who have not answered"
      />
      <SendSettingsRow
        label="Live count"
        summary={
          announceId
            ? {
                value: channel ? `#${channel.name}` : "A channel",
                description: "updated as people answer",
              }
            : { value: "Not posted", description: "or post a live count in a channel" }
        }
        action={open === "announce" ? "Done" : announceId ? "Change" : "Pick a channel"}
        open={open === "announce"}
        onToggle={() => toggle("announce")}
      >
        <p className="max-w-[60ch] text-ink-2 text-sm">
          Holler posts that you sent it and how many have answered, updated as answers come in. It
          never says who answered.
        </p>
        <SendSettingsChannel channel={channel} search={search} onChannel={onChannel} />
        {announceId && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="-ms-3"
              onClick={() => {
                onChange({ announceChannelId: null });
                setOpen(null);
              }}
            >
              Post it nowhere
            </Button>
          </div>
        )}
      </SendSettingsRow>
      <SendSettingsRow
        label="Tags"
        summary={{
          value: "None",
          description: value.tags.length > 0 ? "" : "to find it later on Home",
        }}
        value={tagsValue(value.tags, tagsOpen)}
        action={tagsOpen ? "Done" : value.tags.length > 0 ? "Change" : "Add tags"}
        open={tagsOpen}
        onToggle={() => toggle("tags")}
      >
        <SendSettingsTags
          tags={value.tags}
          suggestions={tagSuggestions}
          onTags={(tags) => onChange({ tags })}
        />
      </SendSettingsRow>
    </>
  );
}

function SendSettings({
  value: valueProp,
  defaultValue = fresh,
  onValueChange,
  problems,
  reach,
  zones = [],
  tagSuggestions = [],
  knownChannels = [],
  search = searchDirectory,
  now: fixedNow,
  timeZone,
  openRow,
  defaultOpenRow = null,
  onOpenRowChange,
  className,
  ...props
}: Props) {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onChange: onValueChange,
  });
  const [open, setOpen] = useControllableState<Row | null>({
    value: openRow,
    defaultValue: defaultOpenRow,
    onChange: onOpenRowChange,
  });
  const headingId = useId();
  const now = useNow(fixedNow);
  const senderZone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const context = { now, senderZone, zones };
  const [channels, setChannels] = useState(
    () => new Map(knownChannels.map((c) => [c.slackId, c] as const)),
  );
  const announceId = value.announceChannelId;
  const channel = announceId
    ? (channels.get(announceId) ?? knownChannels.find((c) => c.slackId === announceId) ?? null)
    : null;
  const warning = anonymousWarning(value.anonymous, reach);

  return (
    <section
      data-slot="send-settings"
      aria-labelledby={headingId}
      className={cn("grid gap-2.5", className)}
      {...props}
    >
      <h2 id={headingId} className="px-1 text-lg">
        Settings
      </h2>
      <Plate>
        <SettingsRows
          value={value}
          onChange={(patch) => setValue({ ...value, ...patch })}
          context={context}
          closeProblem={problems?.closesAt}
          open={open}
          setOpen={setOpen}
          channel={channel}
          onChannel={(next) => {
            setChannels((previous) => new Map(previous).set(next.slackId, next));
            setValue({ ...value, announceChannelId: next.slackId });
          }}
          tagSuggestions={tagSuggestions}
          search={search}
        />
        {warning && (
          <p
            role="status"
            className="flex items-start gap-2.5 border-divider border-t bg-waiting px-5 py-3 text-sm text-waiting-ink"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {warning}
          </p>
        )}
      </Plate>
    </section>
  );
}

export { SendSettings };
