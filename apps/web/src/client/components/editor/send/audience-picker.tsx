import type { HollerDraft } from "@holler/core";
import { Building2, Hash, Plus, Users, X } from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Avatar } from "@/components/ui/avatar";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Plate } from "@/components/ui/plate";
import { cn } from "@/lib/cn";
import { count, peopleLabel } from "@/lib/format";
import { useControllableState } from "@/lib/use-controllable-state";
import {
  type AudienceEntry,
  type DirectoryGroup,
  type DirectoryPerson,
  type DirectorySearch,
  entryName,
  everyoneEntry,
  groupEntry,
  personEntry,
  searchDirectory,
  useDirectory,
} from "./directory";
import {
  audienceReach,
  isTimeZone,
  type Reach,
  reachLabel,
  type ZoneCount,
  zoneName,
} from "./send-logic";

/** People, groups and channels, or everyone: the draft's audience. */
type AudienceSelection = HollerDraft["audience"];

/** What the rest of the Send stage needs to know about the audience. */
export interface AudienceSummary {
  reach: Reach;
  /** The chosen people's time zones. People in groups are not known until it sends. */
  zones: ZoneCount[];
  /** What was chosen, in order, for the big-send check. */
  chosen: AudienceEntry[];
}

const nobody: AudienceSelection = { people: [], groups: [], everyone: false };

interface Props extends Omit<ComponentProps<"section">, "defaultValue"> {
  /** Leave undefined to let the picker keep its own, starting at `defaultValue` (nobody). */
  value?: AudienceSelection | undefined;
  defaultValue?: AudienceSelection | undefined;
  onValueChange?: ((value: AudienceSelection) => void) | undefined;
  /** Why it cannot be sent to this audience, such as "Choose who to send it to." */
  problem?: string | undefined;
  /** People and groups already in the draft, so their chips have names before any search. */
  known?: { people?: DirectoryPerson[]; groups?: DirectoryGroup[] } | undefined;
  /** Everyone in the workspace, for the reach of Everyone. */
  workspaceSize?: number | null | undefined;
  onSummaryChange?: ((summary: AudienceSummary) => void) | undefined;
  /** The directory search; the API by default. */
  search?: DirectorySearch | undefined;
}

const tile = "grid size-[26px] shrink-0 place-items-center rounded-full bg-tint text-tint-ink";

function EntryMark({ entry }: { entry: AudienceEntry }) {
  if (entry.kind === "person") {
    return (
      <Avatar
        name={entry.person.name}
        seed={entry.person.slackUserId}
        src={entry.person.avatarUrl}
      />
    );
  }
  const Icon =
    entry.kind === "everyone" ? Building2 : entry.group.kind === "channel" ? Hash : Users;
  return (
    <span aria-hidden className={tile}>
      <Icon className="size-3.5" strokeWidth={2} />
    </span>
  );
}

function entryDescription(
  entry: AudienceEntry,
  workspaceSize: number | null | undefined,
): string | undefined {
  if (entry.kind === "everyone") {
    return workspaceSize ? peopleLabel(workspaceSize) : "Every person in this Slack workspace";
  }
  if (entry.kind === "person") {
    // Whatever tells two people with one name apart: their Slack handle, or where they are.
    const { displayName, name, timeZone } = entry.person;
    if (displayName && displayName !== name) return `@${displayName}`;
    return isTimeZone(timeZone) ? zoneName(timeZone) : undefined;
  }
  const { group } = entry;
  const kind = group.kind === "channel" ? "Channel" : "User group";
  if (group.memberCount == null) return kind;
  return `${kind}, ${peopleLabel(group.memberCount)}`;
}

/** A chosen person or group: its mark, its name, its size, and a way to take it out. */
function AudienceChip({
  entry,
  workspaceSize,
  onRemove,
}: {
  entry: AudienceEntry;
  workspaceSize: number | null | undefined;
  onRemove: () => void;
}) {
  const name = entryName(entry);
  const size =
    entry.kind === "group"
      ? entry.group.memberCount
      : entry.kind === "everyone"
        ? workspaceSize
        : null;
  return (
    <li className="flex h-8 max-w-full items-center gap-1.5 rounded-full bg-well ps-[3px] pe-1 font-normal text-ink text-sm">
      <EntryMark entry={entry} />
      <span className="min-w-0 truncate">{name}</span>
      {size != null && <span className="text-muted tabular">{count(size)}</span>}
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        className="relative grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors hoverable:hover:bg-hover hoverable:hover:text-ink pointer-coarse:before:absolute pointer-coarse:before:-inset-2.5 pointer-coarse:before:content-['']"
      >
        <X className="size-3.5" strokeWidth={2} aria-hidden />
      </button>
    </li>
  );
}

function sameEntry(a: AudienceEntry | undefined, b: AudienceEntry) {
  return a !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

function matchesEveryone(query: string) {
  const q = query.trim().toLocaleLowerCase();
  return q === "" || "everyone in the workspace".includes(q) || "all".startsWith(q);
}

/**
 * Who a Holler goes to: people, Slack user groups and channels' members, or everyone. Chosen
 * ones are chips; the add control searches the directory in a panel, or a sheet on touch. The
 * count is approximate when groups are in it, because they can overlap.
 */
function AudiencePicker({
  value: valueProp,
  defaultValue = nobody,
  onValueChange,
  problem,
  known,
  workspaceSize,
  onSummaryChange,
  search = searchDirectory,
  className,
  ...props
}: Props) {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onChange: onValueChange,
  });
  const headingId = useId();
  const problemId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const directory = useDirectory(search, query, open);

  // Every entry seen, newest data kept, so a chip keeps its name and size after the search moves on.
  const [seen, setSeen] = useState(() => {
    const map = new Map<string, AudienceEntry>();
    for (const person of known?.people ?? []) map.set(person.slackUserId, personEntry(person));
    for (const group of known?.groups ?? []) map.set(group.slackId, groupEntry(group));
    return map;
  });
  const results = useMemo<AudienceEntry[]>(() => {
    const data = directory.data;
    const found = data ? [...data.groups.map(groupEntry), ...data.people.map(personEntry)] : [];
    return matchesEveryone(query) ? [everyoneEntry, ...found] : found;
  }, [directory.data, query]);
  useEffect(() => {
    // New entries and newer data for known ones, such as a group that grew past 50 people.
    const fresh = results.filter(
      (entry) => entry.kind !== "everyone" && !sameEntry(seen.get(entry.id), entry),
    );
    if (fresh.length === 0) return;
    setSeen((previous) => {
      const next = new Map(previous);
      for (const entry of fresh) next.set(entry.id, entry);
      return next;
    });
  }, [results, seen]);

  const chosen = useMemo<AudienceEntry[]>(() => {
    if (value.everyone) return [everyoneEntry];
    const named = (id: string, kind: "person" | "group"): AudienceEntry =>
      seen.get(id) ??
      (kind === "person"
        ? personEntry({
            slackUserId: id,
            name: "Someone",
            displayName: null,
            avatarUrl: null,
            timeZone: null,
          })
        : groupEntry({
            slackId: id,
            kind: "usergroup",
            name: "A group",
            handle: null,
            memberCount: null,
          }));
    return [
      ...value.groups.map((id) => named(id, "group")),
      ...value.people.map((id) => named(id, "person")),
    ];
  }, [value, seen]);

  const reach = useMemo(
    () =>
      audienceReach(
        value,
        (id) => {
          const entry = seen.get(id);
          return entry?.kind === "group" ? entry.group.memberCount : null;
        },
        workspaceSize,
      ),
    [value, seen, workspaceSize],
  );
  const zones = useMemo<ZoneCount[]>(() => {
    const byZone = new Map<string | null, number>();
    for (const entry of chosen) {
      if (entry.kind !== "person") continue;
      const zone = entry.person.timeZone;
      byZone.set(zone, (byZone.get(zone) ?? 0) + 1);
    }
    return [...byZone.entries()].map(([zone, people]) => ({ zone, people }));
  }, [chosen]);

  const report = useRef(onSummaryChange);
  report.current = onSummaryChange;
  useEffect(() => {
    report.current?.({ reach, zones, chosen });
  }, [reach, zones, chosen]);

  const select = (next: AudienceEntry[]) => {
    const picksEveryone = next.some((entry) => entry.kind === "everyone");
    // Everyone holds every person already; a pick after it narrows the audience to that pick.
    const everyone = picksEveryone && !(value.everyone && next.length > 1);
    const rest = next.filter((entry) => entry.kind !== "everyone");
    setValue(
      everyone
        ? { people: [], groups: [], everyone: true }
        : {
            people: rest.filter((e) => e.kind === "person").map((e) => e.id),
            groups: rest.filter((e) => e.kind === "group").map((e) => e.id),
            everyone: false,
          },
    );
    setQuery("");
  };

  const remove = (entry: AudienceEntry) => {
    select(chosen.filter((other) => other.id !== entry.id));
    trigger.current?.focus();
  };

  let empty: ReactNode = null;
  if (directory.isError) empty = "We could not load the directory. Close this and try again.";
  else if (!directory.data) empty = "Searching the directory";
  else if (query.trim()) empty = "Nobody and no group by that name in this workspace.";
  else empty = "Nobody here yet. Holler is still reading the Slack directory.";

  return (
    <section
      data-slot="audience-picker"
      aria-labelledby={headingId}
      className={cn("grid gap-2.5", className)}
      {...props}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
        <h2 id={headingId} className="text-lg">
          Who
        </h2>
        <span className="text-muted text-sm tabular" aria-live="polite">
          {reachLabel(reach)}
        </span>
      </div>
      <Plate className={cn("px-3 py-3", problem && "edge-danger")}>
        <div className="flex flex-wrap items-center gap-1.5">
          {chosen.length > 0 && (
            <ul aria-label="Chosen" className="contents">
              {chosen.map((entry) => (
                <AudienceChip
                  key={entry.id}
                  entry={entry}
                  workspaceSize={workspaceSize}
                  onRemove={() => remove(entry)}
                />
              ))}
            </ul>
          )}
          <Combobox<AudienceEntry, true>
            multiple
            items={results}
            filter={null}
            value={chosen}
            onValueChange={select}
            inputValue={query}
            onInputValueChange={setQuery}
            open={open}
            onOpenChange={setOpen}
            isItemEqualToValue={(a, b) => a.id === b.id}
            itemToStringLabel={entryName}
          >
            <ComboboxTrigger
              ref={trigger}
              variant="chip"
              // Named outright: Base UI can treat the words inside as a value placeholder.
              aria-label={chosen.length > 0 ? "Add more people" : "Add people, groups or channels"}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? problemId : undefined}
              className="relative inline-flex h-8 items-center gap-1.5 rounded-full ps-2 pe-3 text-muted text-sm outline-none transition-colors hoverable:hover:bg-hover hoverable:hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-hover data-popup-open:text-ink pointer-coarse:before:absolute pointer-coarse:before:-inset-y-1.5 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']"
            >
              <Plus className="size-4" strokeWidth={2} aria-hidden />
              {chosen.length > 0 ? "Add more" : "Add people, groups or channels"}
            </ComboboxTrigger>
            <ComboboxContent aria-label="Who to send it to" className="w-[min(22rem,92vw)]">
              <ComboboxInput placeholder="Search people and groups" />
              <ComboboxEmpty>{results.length === 0 ? empty : null}</ComboboxEmpty>
              <ComboboxList>
                {(entry: AudienceEntry) => (
                  <ComboboxItem
                    key={entry.id}
                    value={entry}
                    description={entryDescription(entry, workspaceSize)}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <EntryMark entry={entry} />
                      <span className="truncate">{entryName(entry)}</span>
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      </Plate>
      {problem && (
        <p id={problemId} className="px-1 text-danger-ink text-sm">
          {problem}
        </p>
      )}
    </section>
  );
}

export { AudiencePicker };
