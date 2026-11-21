import { workdayStartHour } from "@holler/core";
import { Hash, Plus, TriangleAlert, X } from "lucide-react";
import { type ComponentProps, type ReactNode, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, StatusDot } from "@/components/ui/chip";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Plate, PlateRow } from "@/components/ui/plate";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { count, peopleLabel } from "@/lib/format";
import { useControllableState } from "@/lib/use-controllable-state";
import {
  type DirectoryGroup,
  type DirectorySearch,
  searchDirectory,
  useDirectory,
} from "./directory";
import {
  anonymousWarning,
  answersSummary,
  atWallClock,
  clockTime,
  closePresets,
  closeSummary,
  closeTime,
  landingTimes,
  openHours,
  type Reach,
  type RowSummary,
  remindersSummary,
  type SendFields,
  sendSummary,
  sendWindow,
  wallClock,
  weekday,
  type ZoneCount,
  zoneName,
} from "./send-logic";
import { useNow } from "./use-now";

export type SendSettingsRow = "send" | "close" | "announce" | "tags";
type Row = SendSettingsRow;

const MAX_TAGS = 10;

/** A new draft's settings: sent when you press Send, closed three days later, named, reminded. */
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
  /**
   * The draft's settings. Leave undefined to let the rows keep their own, starting at
   * `defaultValue`. A draft with more fields than these fits; `onValueChange` hands it back whole.
   */
  value?: SendFields | undefined;
  defaultValue?: SendFields | undefined;
  onValueChange?: ((value: SendFields) => void) | undefined;
  /** The server's word on a field, beside the row it is about. */
  problems?: { sendAt?: string | undefined; closesAt?: string | undefined } | undefined;
  /** Who it reaches, from the AudiencePicker, for the anonymous warning. */
  reach: Reach;
  /** The chosen people's time zones, from the AudiencePicker, for when it lands. */
  zones?: ZoneCount[] | undefined;
  /** Tags already used in this workspace, offered before a new one is made. */
  tagSuggestions?: string[] | undefined;
  /** The announcement channel, when the draft has one, so the row can name it. */
  knownChannels?: DirectoryGroup[] | undefined;
  /** The directory search for channels; the API by default. */
  search?: DirectorySearch | undefined;
  /** The clock, shared with the bar through `useNow`. Ticks every half minute by default. */
  now?: Date | undefined;
  /** The sender's time zone; this browser's by default. */
  timeZone?: string | undefined;
  /**
   * The open row, such as Closes when a send was refused over its close time. Leave undefined to
   * let the rows open and shut themselves, starting at `defaultOpenRow`.
   */
  openRow?: Row | null | undefined;
  defaultOpenRow?: Row | null | undefined;
  onOpenRowChange?: ((row: Row | null) => void) | undefined;
}

/** Tomorrow at the start of the working day, on the sender's clock. */
function tomorrowMorning(now: Date, zone: string): Date {
  const today = wallClock(now, zone);
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return atWallClock(
    {
      year: tomorrow.getUTCFullYear(),
      month: tomorrow.getUTCMonth() + 1,
      day: tomorrow.getUTCDate(),
      hour: workdayStartHour,
      minute: 0,
    },
    zone,
  );
}

/** The first whole hour on the sender's clock at or after `at`. */
function nextWholeHour(at: Date, zone: string): Date {
  const next = atWallClock({ ...wallClock(at, zone), minute: 0 }, zone);
  return next.getTime() < at.getTime() ? new Date(next.getTime() + 3_600_000) : next;
}

/*
 * The browser's date and time pickers read and write this browser's clock. These carry a time
 * across: the picker shows the sender's wall-clock time, and what is picked is read on it.
 */
function toPicker(at: Date, zone: string): Date {
  const wall = wallClock(at, zone);
  return new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
}

function fromPicker(picked: Date, zone: string): Date {
  return atWallClock(
    {
      year: picked.getFullYear(),
      month: picked.getMonth() + 1,
      day: picked.getDate(),
      hour: picked.getHours(),
      minute: picked.getMinutes(),
    },
    zone,
  );
}

// ─── A row ───────────────────────────────────────────────────────────────────────────────────

const rowGrid =
  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-5 py-3.5 text-start sm:grid-cols-[6rem_minmax(0,1fr)_auto]";

function Fact({ summary, value }: { summary: RowSummary; value?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="font-normal text-ink tabular">{value ?? summary.value}</span>
      <span className={cn("text-sm", summary.tone === "danger" ? "text-danger-ink" : "text-muted")}>
        {summary.description}
      </span>
    </span>
  );
}

function RowLabel({ id, children }: { id?: string | undefined; children: ReactNode }) {
  return (
    <span id={id} className="col-span-2 text-muted text-sm sm:col-span-1">
      {children}
    </span>
  );
}

/** A row that opens: the whole line is the button, and its action word says what a press does. */
function OpenRow({
  label,
  summary,
  value,
  action,
  open,
  onToggle,
  children,
}: {
  label: string;
  summary: RowSummary;
  value?: ReactNode | undefined;
  action: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <PlateRow data-open={open || undefined}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          rowGrid,
          "min-h-14 outline-none transition-colors duration-150 hoverable:hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2",
        )}
      >
        <RowLabel>{label}</RowLabel>
        <Fact summary={summary} value={value} />
        <span className="text-primary text-sm">{action}</span>
      </button>
      {/* Grows to its content's own height: no measuring, and nothing inside is reachable while shut. */}
      <div
        id={panelId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-(--ease-out) motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="grid gap-4 px-5 pt-1 pb-5 sm:ps-33">{children}</div>
        </div>
      </div>
    </PlateRow>
  );
}

/** A row that a switch decides, at once. */
function SwitchRow({
  label,
  summary,
  checked,
  onCheckedChange,
  switchLabel,
  children,
}: {
  label: string;
  summary: RowSummary;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  switchLabel: string;
  children?: ReactNode;
}) {
  return (
    <PlateRow>
      <div className={cn(rowGrid, "min-h-14")}>
        <RowLabel>{label}</RowLabel>
        <Fact summary={summary} />
        <Switch aria-label={switchLabel} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {children}
    </PlateRow>
  );
}

// ─── When it lands ───────────────────────────────────────────────────────────────────────────

const SHOWN_ZONES = 8;

/**
 * What the chosen time means where people are. In your time: the time on their clocks, flagged
 * outside the working day. In each person's time: when each zone gets it on your clock.
 */
function LandingPreview({
  sendAt,
  inRecipientTimeZone,
  senderZone,
  zones,
  reach,
  now,
}: {
  sendAt: Date;
  inRecipientTimeZone: boolean;
  senderZone: string;
  zones: ZoneCount[];
  reach: Reach;
  now: Date;
}) {
  const rows = landingTimes({ sendAt, inRecipientTimeZone, senderZone, zones, now });
  const inGroups = reach.everyone || !reach.exact;
  if (rows.length === 0 && !inGroups) return null;
  const yours = { timeZone: senderZone };
  const sendDay = weekday(sendAt, yours);
  const shown = rows.slice(0, SHOWN_ZONES);
  const more = rows.length - shown.length;
  const noZone = zones.some((z) => !z.zone);
  return (
    <div className="grid gap-2 rounded-md bg-well px-3.5 py-3 text-sm">
      {rows.length > 0 && (
        <>
          <p className="text-ink-2">
            {inRecipientTimeZone
              ? `Each person gets it at ${clockTime(sendAt, yours)} on their own clock. On yours:`
              : "Everyone gets it at once. On their clocks:"}
          </p>
          <ul className="grid gap-1">
            {shown.map((row) => {
              const time = inRecipientTimeZone
                ? clockTime(row.at, yours)
                : clockTime(row.at, { timeZone: row.zone });
              const otherDay = inRecipientTimeZone && weekday(row.at, yours) !== sendDay;
              const flag = row.passed
                ? "already past there, so it goes as soon as it sends"
                : row.outsideWorkday
                  ? "outside their working day"
                  : null;
              return (
                <li
                  key={row.zone}
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
                >
                  <span className="text-ink tabular">
                    {otherDay ? `${weekday(row.at, yours)} ${time}` : time}
                  </span>
                  <span className="min-w-0 text-ink-2">
                    {row.yours ? "Your time zone" : zoneName(row.zone)}
                    <span className="text-muted">
                      , {peopleLabel(row.people).toLocaleLowerCase()}
                    </span>
                  </span>
                  {flag && (
                    <span className="col-start-2 inline-flex items-center gap-1.5 text-ink-2 sm:col-start-auto">
                      <StatusDot status="waiting" />
                      {flag}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {more > 0 && (
            <p className="text-muted">
              {more === 1 ? "And 1 more time zone." : `And ${count(more)} more time zones.`}
            </p>
          )}
        </>
      )}
      {inGroups && (
        <p className="text-muted">
          {inRecipientTimeZone
            ? "People in groups and channels get it by their own clock too."
            : "People in groups and channels get it at the same moment."}
        </p>
      )}
      {inRecipientTimeZone && noZone && (
        <p className="text-muted">
          Anyone with no time zone in Slack gets it at {clockTime(sendAt, yours)} UTC.
        </p>
      )}
    </div>
  );
}

// ─── Lists in rows ───────────────────────────────────────────────────────────────────────────

function ChannelPicker({
  channel,
  onChannel,
  search,
}: {
  channel: DirectoryGroup | null;
  onChannel: (channel: DirectoryGroup) => void;
  search: DirectorySearch;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const directory = useDirectory(search, query, open);
  const channels = (directory.data?.groups ?? []).filter((g) => g.kind === "channel");
  return (
    <Field className="sm:max-w-sm">
      <FieldLabel>Channel</FieldLabel>
      <Combobox<DirectoryGroup>
        items={channels}
        filter={null}
        value={channel}
        onValueChange={(next) => next && onChannel(next)}
        inputValue={query}
        onInputValueChange={setQuery}
        open={open}
        onOpenChange={setOpen}
        isItemEqualToValue={(a, b) => a.slackId === b.slackId}
        itemToStringLabel={(g) => `#${g.name}`}
      >
        <ComboboxTrigger>
          <ComboboxValue placeholder="Pick a channel" />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="Search channels" />
          <ComboboxEmpty>
            {channels.length > 0
              ? null
              : directory.isError
                ? "We could not load the channels. Close this and try again."
                : !directory.data
                  ? "Searching channels"
                  : "No channel by that name. Holler sees public channels and the private ones it was added to."}
          </ComboboxEmpty>
          <ComboboxList>
            {(g: DirectoryGroup) => (
              <ComboboxItem
                key={g.slackId}
                value={g}
                description={g.memberCount == null ? undefined : peopleLabel(g.memberCount)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Hash className="size-4 text-muted" aria-hidden />
                  <span className="truncate">{g.name}</span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}

type TagItem = { tag: string; create: boolean };

function TagEditor({
  tags,
  suggestions,
  onTags,
}: {
  tags: string[];
  suggestions: string[];
  onTags: (tags: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const typed = query.trim().toLocaleLowerCase().slice(0, 40);
  const items = useMemo<TagItem[]>(() => {
    const unused = [...new Set(suggestions.map((t) => t.toLocaleLowerCase()))].filter(
      (t) => !tags.includes(t),
    );
    const matching = unused.filter((t) => t.includes(typed)).map((tag) => ({ tag, create: false }));
    const exists = typed === "" || tags.includes(typed) || unused.includes(typed);
    return exists ? matching : [...matching, { tag: typed, create: true }];
  }, [suggestions, tags, typed]);
  const full = tags.length >= MAX_TAGS;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length > 0 && (
          <ul aria-label="Tags" className="contents">
            {tags.map((tag) => (
              <li
                key={tag}
                className="flex h-8 items-center gap-1 rounded-full bg-well ps-3 pe-1 font-normal text-ink text-sm"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove the tag ${tag}`}
                  onClick={() => onTags(tags.filter((t) => t !== tag))}
                  className="relative grid size-6 place-items-center rounded-full text-muted transition-colors hoverable:hover:bg-hover hoverable:hover:text-ink pointer-coarse:before:absolute pointer-coarse:before:-inset-2.5 pointer-coarse:before:content-['']"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Combobox<TagItem, true>
          multiple
          items={items}
          filter={null}
          value={[]}
          onValueChange={(picked) => {
            const added = picked.map((item) => item.tag).filter((t) => t && !tags.includes(t));
            if (added.length > 0) onTags([...tags, ...added].slice(0, MAX_TAGS));
            setQuery("");
          }}
          inputValue={query}
          onInputValueChange={setQuery}
          isItemEqualToValue={(a, b) => a.tag === b.tag}
          itemToStringLabel={(item) => item.tag}
          disabled={full}
        >
          <ComboboxTrigger
            variant="chip"
            className="relative inline-flex h-8 items-center gap-1.5 rounded-full ps-2 pe-3 text-muted text-sm outline-none transition-colors hoverable:hover:bg-hover hoverable:hover:text-ink focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50 data-popup-open:bg-hover data-popup-open:text-ink pointer-coarse:before:absolute pointer-coarse:before:-inset-y-1.5 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']"
          >
            <Plus className="size-4" aria-hidden />
            Add a tag
          </ComboboxTrigger>
          <ComboboxContent aria-label="Tags" className="w-72">
            <ComboboxInput placeholder="Find or make a tag" maxLength={40} />
            <ComboboxEmpty>{items.length === 0 ? "Type a tag to make one." : null}</ComboboxEmpty>
            <ComboboxList>
              {(item: TagItem) => (
                <ComboboxItem
                  key={`${item.create}-${item.tag}`}
                  value={item}
                  icon={item.create ? <Plus className="size-4 text-muted" /> : undefined}
                >
                  {item.create ? `Make the tag "${item.tag}"` : item.tag}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      <p className="text-muted text-sm">
        {full
          ? "That is the most tags one Holler can have."
          : "Tags group hollers on Home. Up to 10."}
      </p>
    </div>
  );
}

// ─── The plate ───────────────────────────────────────────────────────────────────────────────

/**
 * When it sends and closes, how answers are kept, reminders, where it is announced, and tags.
 * Each row reads as a fact; Change opens one row at a time, so the defaults need no clicks.
 */
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
  const onChange = (patch: Partial<SendFields>) => setValue({ ...value, ...patch });
  const headingId = useId();
  const now = useNow(fixedNow);
  const senderZone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const context = { now, senderZone, zones };
  const [open, setOpen] = useControllableState<Row | null>({
    value: openRow,
    defaultValue: defaultOpenRow,
    onChange: onOpenRowChange,
  });
  const toggle = (row: Row) => setOpen(open === row ? null : row);

  const [channels, setChannels] = useState(
    () => new Map(knownChannels.map((c) => [c.slackId, c] as const)),
  );
  const announceId = value.announceChannelId;
  // Picked channels first, then what the caller knows, which may arrive after the first render.
  const channel = announceId
    ? (channels.get(announceId) ?? knownChannels.find((c) => c.slackId === announceId) ?? null)
    : null;

  const send = sendSummary(value, context, problems?.sendAt);
  const close = closeSummary(value, context, problems?.closesAt);
  const window = sendWindow({
    sendAt: value.sendAt,
    inRecipientTimeZone: value.sendInRecipientTimeZone,
    senderZone,
    zones,
    now,
  });
  const answers = answersSummary(value.anonymous);
  const warning = anonymousWarning(value.anonymous, reach);
  const reminders = remindersSummary(value.remindersEnabled, openHours(value, context));
  const closePick = value.closesAt ? "fixed" : String(value.closeAfterHours);
  const isPreset = closePresets.some((p) => String(p.hours) === closePick);

  return (
    <section
      data-slot="send-settings"
      aria-labelledby={headingId}
      className={cn("grid gap-2.5", className)}
      {...props}
    >
      <h2 id={headingId} className="px-1 text-lg">
        When and how
      </h2>
      <Plate>
        <OpenRow
          label="Sends"
          summary={send}
          action={open === "send" ? "Done" : value.sendAt ? "Change" : "Send later"}
          open={open === "send"}
          onToggle={() => {
            if (!value.sendAt && open !== "send")
              onChange({ sendAt: tomorrowMorning(now, senderZone) });
            toggle("send");
          }}
        >
          <DateTimeInput
            value={value.sendAt && toPicker(value.sendAt, senderZone)}
            min={toPicker(now, senderZone)}
            onValueChange={(picked) => onChange({ sendAt: fromPicker(picked, senderZone) })}
            aria-invalid={send.tone === "danger" || undefined}
          />
          <RadioGroup
            aria-label="Whose clock it sends by"
            value={value.sendInRecipientTimeZone ? "theirs" : "yours"}
            onValueChange={(next) => onChange({ sendInRecipientTimeZone: next === "theirs" })}
            className="gap-2.5"
          >
            <Field orientation="horizontal">
              <RadioGroupItem value="yours" />
              <FieldLabel>
                Your time<span className="text-muted">, {zoneName(senderZone)}</span>
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem value="theirs" />
              <FieldLabel>Each person's own time, so it lands at the same hour for all</FieldLabel>
            </Field>
          </RadioGroup>
          {value.sendAt && (
            <LandingPreview
              sendAt={value.sendAt}
              inRecipientTimeZone={value.sendInRecipientTimeZone}
              senderZone={senderZone}
              zones={zones}
              reach={reach}
              now={now}
            />
          )}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="-ms-3"
              onClick={() => {
                onChange({ sendAt: null, sendInRecipientTimeZone: false });
                setOpen(null);
              }}
            >
              Send it now instead
            </Button>
          </div>
        </OpenRow>

        <OpenRow
          label="Closes"
          summary={close}
          action={open === "close" ? "Done" : "Change"}
          open={open === "close"}
          onToggle={() => toggle("close")}
        >
          <RadioGroup
            aria-label="When it closes"
            value={isPreset || closePick === "fixed" ? closePick : ""}
            onValueChange={(next) => {
              if (next === "fixed") {
                onChange({ closesAt: nextWholeHour(closeTime(value, window), senderZone) });
              } else {
                onChange({ closesAt: null, closeAfterHours: Number(next) });
              }
            }}
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
        </OpenRow>

        <SwitchRow
          label="Answers"
          summary={answers}
          checked={value.anonymous}
          onCheckedChange={(anonymous) => onChange({ anonymous })}
          switchLabel="Anonymous answers"
        >
          {warning && (
            <p
              role="status"
              className="flex items-start gap-2.5 bg-waiting px-5 py-3 text-sm text-waiting-ink"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {warning}
            </p>
          )}
        </SwitchRow>

        <SwitchRow
          label="Reminders"
          summary={reminders}
          checked={value.remindersEnabled}
          onCheckedChange={(remindersEnabled) => onChange({ remindersEnabled })}
          switchLabel="Remind people who have not answered"
        />

        <OpenRow
          label="Announce"
          summary={
            announceId
              ? {
                  // Named once Holler knows the channel; the setting shows either way.
                  value: channel ? `#${channel.name}` : "A channel",
                  description: "with a live count of answers",
                }
              : { value: "Nowhere", description: "or post a live count in a channel" }
          }
          action={open === "announce" ? "Done" : announceId ? "Change" : "Pick a channel"}
          open={open === "announce"}
          onToggle={() => toggle("announce")}
        >
          <p className="max-w-[60ch] text-ink-2 text-sm">
            Holler posts that you sent it and how many have answered, updated as answers come in. It
            never says who answered.
          </p>
          <ChannelPicker
            channel={channel}
            search={search}
            onChannel={(next) => {
              setChannels((previous) => new Map(previous).set(next.slackId, next));
              onChange({ announceChannelId: next.slackId });
            }}
          />
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
        </OpenRow>

        <OpenRow
          label="Tags"
          summary={{
            value: "None",
            description: value.tags.length > 0 ? "" : "to find it later on Home",
          }}
          value={
            open === "tags" && value.tags.length > 0 ? (
              value.tags.length === 1 ? (
                "1 tag"
              ) : (
                `${count(value.tags.length)} tags`
              )
            ) : value.tags.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {value.tags.map((tag) => (
                  <Chip key={tag}>{tag}</Chip>
                ))}
              </span>
            ) : undefined
          }
          action={open === "tags" ? "Done" : value.tags.length > 0 ? "Change" : "Add tags"}
          open={open === "tags"}
          onToggle={() => toggle("tags")}
        >
          <TagEditor
            tags={value.tags}
            suggestions={tagSuggestions}
            onTags={(tags) => onChange({ tags })}
          />
        </OpenRow>
      </Plate>
    </section>
  );
}

export { SendSettings };
