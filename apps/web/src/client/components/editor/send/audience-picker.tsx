import { Combobox } from "@base-ui/react/combobox";
import type { BaseUIEvent } from "@base-ui/react/types";
import type { HollerDraft } from "@holler/core";
import { Building2, Check, Hash, Users, X } from "lucide-react";
import {
  type ClipboardEvent,
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Skeleton } from "@/components/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { controlText } from "@/components/ui/input";
import {
  describedRowClassName,
  descriptionClassName,
  listRowClassName,
  touchRowClassName,
} from "@/components/ui/overlay-list";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { count } from "@/lib/format";
import { useControllableState } from "@/lib/use-controllable-state";
import {
  chipKeyAction,
  fieldKeyAction,
  missedSentence,
  parsePastedList,
  pastedSentence,
  rankEntries,
  resultList,
} from "./audience-logic";
import {
  type AudienceEntry,
  type DirectoryGroup,
  type DirectoryPerson,
  type DirectoryResolve,
  type DirectorySearch,
  entryName,
  everyoneEntry,
  groupEntry,
  personEntry,
  resolveDirectory,
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

type AudienceSelection = HollerDraft["audience"];

export interface AudienceSummary {
  reach: Reach;
  zones: ZoneCount[];
  chosen: AudienceEntry[];
}

interface Props extends Omit<ComponentProps<"section">, "defaultValue"> {
  value?: AudienceSelection | undefined;
  defaultValue?: AudienceSelection | undefined;
  onValueChange?: ((value: AudienceSelection) => void) | undefined;
  problem?: string | undefined;
  known?: { people?: DirectoryPerson[]; groups?: DirectoryGroup[] } | undefined;
  workspaceSize?: number | null | undefined;
  onSummaryChange?: ((summary: AudienceSummary) => void) | undefined;
  search?: DirectorySearch | undefined;
  resolve?: DirectoryResolve | undefined;
  defaultInputValue?: string | undefined;
  inline?: boolean | undefined;
}

const MAX_ROWS = 30;

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

function entryDescription(entry: AudienceEntry): string | undefined {
  if (entry.kind === "everyone") return "Every person in this Slack workspace";
  if (entry.kind === "person") {
    const { displayName, name, timeZone } = entry.person;
    const handle = displayName && displayName !== name ? `@${displayName}` : null;
    const zone = isTimeZone(timeZone) ? zoneName(timeZone) : null;
    if (handle && zone) return `${handle} · ${zone}`;
    return handle ?? zone ?? undefined;
  }
  if (entry.group.kind === "channel") return "Everyone in this channel";
  return entry.group.name === entryName(entry) ? "User group" : `User group, ${entry.group.name}`;
}

function entrySize(entry: AudienceEntry, workspaceSize: number | null | undefined) {
  if (entry.kind === "group") return entry.group.memberCount;
  if (entry.kind === "everyone") return workspaceSize ?? null;
  return null;
}

function addsLabel(size: number): string {
  return size === 1 ? "Adds 1 person" : `Adds ${count(size)} people`;
}

function AudienceChip({
  entry,
  workspaceSize,
  buttonRef,
  onRemove,
  onKeyDown,
}: {
  entry: AudienceEntry;
  workspaceSize: number | null | undefined;
  buttonRef: (button: HTMLButtonElement | null) => void;
  onRemove: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const name = entryName(entry);
  const size = entrySize(entry, workspaceSize);
  return (
    <li
      data-slot="audience-chip"
      className="group/chip flex h-8 max-w-full items-center gap-1.5 rounded-full bg-well ps-[3px] pe-1 font-normal text-ink text-sm transition-colors duration-150 has-focus-visible:bg-tint has-focus-visible:text-tint-ink has-focus-visible:outline-2 has-focus-visible:outline-focus has-focus-visible:outline-offset-1"
    >
      <EntryMark entry={entry} />
      <span className="min-w-0 truncate">{name}</span>
      {size != null && (
        <span className="text-muted tabular group-has-focus-visible/chip:text-tint-ink">
          {count(size)}
        </span>
      )}
      <button
        ref={buttonRef}
        type="button"
        tabIndex={-1}
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        onKeyDown={onKeyDown}
        className="relative grid size-6 shrink-0 place-items-center rounded-full text-muted outline-none transition-colors hoverable:hover:bg-hover hoverable:hover:text-ink group-has-focus-visible/chip:text-tint-ink pointer-coarse:before:absolute pointer-coarse:before:-inset-2.5 pointer-coarse:before:content-['']"
      >
        <X className="size-3.5" strokeWidth={2} aria-hidden />
      </button>
    </li>
  );
}

function ResultRow({
  entry,
  added,
  workspaceSize,
}: {
  entry: AudienceEntry;
  added: boolean;
  workspaceSize: number | null | undefined;
}) {
  const description = entryDescription(entry);
  const size = entrySize(entry, workspaceSize);
  return (
    <Combobox.Item
      value={entry}
      data-slot="audience-result"
      className={cn(
        listRowClassName,
        describedRowClassName,
        touchRowClassName,
        "items-center [&>[aria-hidden]]:mt-0",
      )}
    >
      <EntryMark entry={entry} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{entryName(entry)}</span>
        {(description || size != null) && (
          <span className={cn(descriptionClassName, "truncate whitespace-nowrap")}>
            {size != null && !added ? (
              <>
                <span className="sm:hidden">{addsLabel(size)}</span>
                {description && <span className="max-sm:hidden">{description}</span>}
              </>
            ) : (
              description
            )}
          </span>
        )}
      </span>
      {added ? (
        <span className="flex shrink-0 items-center gap-1 text-muted text-sm">
          <Check className="size-4" strokeWidth={2} aria-hidden />
          Added
        </span>
      ) : (
        size != null && (
          <span className="shrink-0 text-muted text-sm tabular max-sm:hidden">
            {addsLabel(size)}
          </span>
        )
      )}
    </Combobox.Item>
  );
}

function LoadingRows() {
  return (
    <div aria-hidden className="grid gap-1 p-1">
      {[0.6, 0.45, 0.7].map((width) => (
        <div key={width} className="flex h-11 items-center gap-2.5 px-2.5">
          <Skeleton className="size-[26px] rounded-full" />
          <Skeleton className="h-3.5" style={{ width: `${width * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

const nobody: AudienceSelection = { people: [], groups: [], everyone: false };

function AudiencePicker({
  value: valueProp,
  defaultValue = nobody,
  onValueChange: onChangeProp,
  problem,
  known,
  workspaceSize,
  onSummaryChange,
  search = searchDirectory,
  resolve = resolveDirectory,
  defaultInputValue = "",
  inline = false,
  className,
  ...props
}: Props) {
  const [value, onChange] = useControllableState({
    value: valueProp,
    defaultValue,
    onChange: onChangeProp,
  });
  const headingId = useId();
  const problemId = useId();
  const hintId = useId();
  const noteId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const chipButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const highlighted = useRef<AudienceEntry | undefined>(undefined);
  const [open, setOpen] = useState(defaultInputValue !== "");
  const [query, setQuery] = useState(defaultInputValue);
  const [engaged, setEngaged] = useState(defaultInputValue !== "");
  const directory = useDirectory(search, query, engaged);
  const [announcement, setAnnouncement] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pasting, setPasting] = useState<number | null>(null);

  const [seen, setSeen] = useState(() => {
    const map = new Map<string, AudienceEntry>();
    for (const person of known?.people ?? []) map.set(person.slackUserId, personEntry(person));
    for (const group of known?.groups ?? []) map.set(group.slackId, groupEntry(group));
    return map;
  });
  const remember = (entries: readonly AudienceEntry[]) => {
    const fresh = entries.filter(
      (entry) => entry.kind !== "everyone" && seen.get(entry.id) !== entry,
    );
    if (fresh.length === 0) return;
    setSeen((previous) => {
      const next = new Map(previous);
      for (const entry of fresh) next.set(entry.id, entry);
      return next;
    });
  };
  const fetched = useMemo<AudienceEntry[]>(() => {
    const data = directory.data;
    return data ? [...data.groups.map(groupEntry), ...data.people.map(personEntry)] : [];
  }, [directory.data]);
  useEffect(() => {
    remember(fetched);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- remember changes with every entry it keeps; only new results need keeping
  }, [fetched]);

  const current = directory.current;
  const matches = useMemo(
    () => rankEntries(current ? fetched : [...seen.values()], query),
    [current, fetched, seen, query],
  );
  const results = useMemo(() => resultList(matches, query).slice(0, MAX_ROWS), [matches, query]);
  const typed = query.trim() !== "";
  const loading = !directory.current && !directory.isError && matches.length === 0;
  const noMatch = directory.current && typed && matches.length === 0;
  const syncing = Boolean(directory.data?.syncing);

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
  const chosenIds = useMemo(() => new Set(chosen.map((entry) => entry.id)), [chosen]);

  const reachOf = useCallback(
    (next: AudienceSelection) =>
      audienceReach(
        next,
        (id) => {
          const entry = seen.get(id);
          return entry?.kind === "group" ? entry.group.memberCount : null;
        },
        workspaceSize,
      ),
    [seen, workspaceSize],
  );
  const reach = useMemo(() => reachOf(value), [reachOf, value]);
  const zones = useMemo<ZoneCount[]>(() => {
    const byZone = new Map<string | null, number>();
    for (const entry of chosen) {
      if (entry.kind !== "person") continue;
      const zone = entry.person.timeZone;
      byZone.set(zone, (byZone.get(zone) ?? 0) + 1);
    }
    return [...byZone.entries()].map(([zone, people]) => ({ zone, people }));
  }, [chosen]);

  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null) =>
      target instanceof Node && !frame.current?.contains(target);
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (outside(event.target)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (outside(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  const report = useRef(onSummaryChange);
  report.current = onSummaryChange;
  useEffect(() => {
    report.current?.({ reach, zones, chosen });
  }, [reach, zones, chosen]);

  const latest = useRef(value);
  latest.current = value;
  const lastRemoved = useRef<{ entry: AudienceEntry; index: number } | null>(null);
  const undoToast = useRef<string | null>(null);

  const commit = (next: AudienceSelection, said: string) => {
    onChange(next);
    setAnnouncement(`${said} ${reachLabel(reachOf(next))}.`);
  };

  const add = (entries: readonly AudienceEntry[], said: string) => {
    const current = latest.current;
    if (entries.some((entry) => entry.kind === "everyone")) {
      commit({ people: [], groups: [], everyone: true }, said);
      return;
    }
    const base = current.everyone ? { people: [], groups: [] } : current;
    const people = [...base.people];
    const groups = [...base.groups];
    for (const entry of entries) {
      if (entry.kind === "person" && !people.includes(entry.id)) people.push(entry.id);
      if (entry.kind === "group" && !groups.includes(entry.id)) groups.push(entry.id);
    }
    commit({ people, groups, everyone: false }, said);
  };

  const pick = (entry: AudienceEntry) => {
    setNote(null);
    if (chosenIds.has(entry.id)) {
      setAnnouncement(`${entryName(entry)} is already in.`);
    } else {
      const replacing = value.everyone && entry.kind !== "everyone";
      add(
        [entry],
        replacing
          ? `Added ${entryName(entry)} in place of everyone.`
          : `Added ${entryName(entry)}.`,
      );
    }
    if (typed) setOpen(false);
    setQuery("");
  };

  const restore = () => {
    const removed = lastRemoved.current;
    if (!removed) return;
    lastRemoved.current = null;
    if (undoToast.current) toast.close(undoToast.current);
    const { entry, index } = removed;
    const current = latest.current;
    const name = entryName(entry);
    if (entry.kind === "everyone") {
      commit({ people: [], groups: [], everyone: true }, `${name} is back.`);
      return;
    }
    if (current.everyone || [...current.people, ...current.groups].includes(entry.id)) return;
    const groups = [...current.groups];
    const people = [...current.people];
    if (entry.kind === "group") groups.splice(index, 0, entry.id);
    else people.splice(Math.max(0, index - groups.length), 0, entry.id);
    commit({ people, groups, everyone: false }, `${name} is back.`);
  };

  const remove = (entry: AudienceEntry) => {
    const index = chosen.findIndex((other) => other.id === entry.id);
    lastRemoved.current = { entry, index };
    setNote(null);
    const current = latest.current;
    commit(
      {
        people: current.people.filter((id) => id !== entry.id),
        groups: current.groups.filter((id) => id !== entry.id),
        everyone: entry.kind === "everyone" ? false : current.everyone,
      },
      `Removed ${entryName(entry)}.`,
    );
    if (undoToast.current) toast.close(undoToast.current);
    undoToast.current = toast.add({
      title: `Removed ${entryName(entry)}`,
      actionProps: { children: "Undo", onClick: restore },
    });
    input.current?.focus();
  };

  const onChipKey = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const action = chipKeyAction(event.key, index, chosen.length);
    if (!action) return;
    if (event.key.length !== 1) event.preventDefault();
    const entry = chosen[index];
    if (action.remove && entry) remove(entry);
    if (action.focus === "input") input.current?.focus();
    else chipButtons.current[action.focus]?.focus();
  };

  const onFieldKey = (event: BaseUIEvent<KeyboardEvent<HTMLInputElement>>) => {
    const target = event.currentTarget;
    const action = fieldKeyAction({
      key: event.key,
      value: target.value,
      caret: target.selectionStart ?? 0,
      selection: target.selectionStart !== target.selectionEnd,
      chips: chosen.length,
      open,
      highlighted: highlighted.current !== undefined,
      shift: event.shiftKey,
      mod: event.metaKey || event.ctrlKey,
    });
    if (!action) return;
    event.preventBaseUIHandler();
    event.preventDefault();
    if (action === "select-last-chip") chipButtons.current[chosen.length - 1]?.focus();
    else if (action === "open") setOpen(true);
    else if (action === "close") setOpen(false);
    else if (action === "commit" && highlighted.current) pick(highlighted.current);
    else if (action === "undo") restore();
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (typed) return;
    const list = parsePastedList(event.clipboardData.getData("text"));
    if (!list) return;
    event.preventDefault();
    setOpen(false);
    setNote(null);
    setPasting(list.length);
    resolve(list)
      .then((found) => {
        const entries = [...found.groups.map(groupEntry), ...found.people.map(personEntry)];
        remember(entries);
        const fresh = entries.filter((entry) => !chosenIds.has(entry.id));
        if (fresh.length) add(fresh, pastedSentence(fresh.length));
        const missed = missedSentence(found.missed);
        setNote(missed);
        if (!fresh.length) setAnnouncement(`${pastedSentence(0)} ${missed ?? ""}`.trim());
      })
      .catch(() =>
        setNote("Holler could not read that list. Check your connection and paste it again."),
      )
      .finally(() => setPasting(null));
  };

  const onFieldPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    input.current?.focus();
  };

  const list = (
    <>
      {loading && <LoadingRows />}
      {directory.isError && !directory.current && (
        <p className="px-3.5 pt-3 pb-1 text-muted text-sm text-pretty">
          Holler could not search the directory. Check your connection and type again.
        </p>
      )}
      {noMatch && (
        <p className="px-3.5 pt-3 pb-1 text-muted text-sm text-pretty">
          No one in Slack matches “{query.trim()}”. Try a first name, an @handle or a #channel.
        </p>
      )}
      <Combobox.List
        aria-label="Matches"
        className="min-h-0 flex-1 scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none"
      >
        {(entry: AudienceEntry) => (
          <ResultRow
            key={entry.id}
            entry={entry}
            added={chosenIds.has(entry.id)}
            workspaceSize={workspaceSize}
          />
        )}
      </Combobox.List>
      {syncing && (
        <p className="border-divider border-t px-3.5 py-2.5 text-muted text-sm text-pretty">
          Holler is still reading your Slack directory, so some people may be missing.
        </p>
      )}
    </>
  );

  const placeholder = chosen.length === 0 ? "Type a name, @group or #channel" : undefined;
  const described = [hintId, problem ? problemId : null, note ? noteId : null]
    .filter(Boolean)
    .join(" ");

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
        <span data-slot="audience-reach" className="text-muted text-sm tabular">
          {reachLabel(reach)}
        </span>
      </div>
      <Combobox.Root<AudienceEntry, true>
        multiple
        items={results}
        filter={null}
        value={chosen}
        onValueChange={(next) => {
          const entry = next.find((e) => !chosenIds.has(e.id)) ?? highlighted.current;
          if (entry) pick(entry);
        }}
        inputValue={query}
        onInputValueChange={(next) => {
          setQuery(next);
          setEngaged(true);
          if (next.trim()) setOpen(true);
        }}
        open={open && !pasting}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setEngaged(true);
        }}
        onItemHighlighted={(entry) => {
          highlighted.current = entry;
        }}
        isItemEqualToValue={(a, b) => a.id === b.id}
        itemToStringLabel={entryName}
        autoHighlight
        inline
      >
        <div ref={frame} className="relative">
          <div
            ref={field}
            data-slot="audience-field"
            onPointerDown={onFieldPointerDown}
            className={cn(
              "flex max-h-[min(15rem,45dvh)] min-h-13 cursor-text flex-wrap items-center gap-1.5 overflow-y-auto rounded-plate bg-plate px-2.5 py-2.5 edge transition-[box-shadow] duration-150 focus-within:edge-2",
              problem && "edge-danger focus-within:edge-danger",
            )}
          >
            {chosen.length > 0 && (
              <ul aria-label="Chosen" className="contents">
                {chosen.map((entry, index) => (
                  <AudienceChip
                    key={entry.id}
                    entry={entry}
                    workspaceSize={workspaceSize}
                    buttonRef={(button) => {
                      chipButtons.current[index] = button;
                    }}
                    onRemove={() => remove(entry)}
                    onKeyDown={onChipKey(index)}
                  />
                ))}
              </ul>
            )}
            <Combobox.Input
              ref={input}
              data-slot="audience-input"
              aria-label={
                chosen.length > 0
                  ? "Add more people, groups or channels"
                  : "Add people, groups or channels"
              }
              aria-expanded={open}
              aria-invalid={problem ? true : undefined}
              aria-describedby={described}
              placeholder={placeholder}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              onKeyDown={onFieldKey}
              onPaste={onPaste}
              onFocus={() => {
                setEngaged(true);
                field.current?.scrollTo({ top: field.current.scrollHeight });
              }}
              className={cn(
                controlText,
                "h-8 min-w-[8ch] flex-1 bg-transparent px-1.5 text-ink outline-none placeholder:text-muted",
              )}
            />
          </div>
          <div
            data-slot="audience-results"
            hidden={!open}
            className={cn(
              "floating flex flex-col overflow-hidden rounded-md text-ink",
              inline
                ? "mt-1.5 max-h-[24rem]"
                : "absolute inset-x-0 top-full z-(--z-dropdown) mt-1.5 max-h-[min(24rem,55dvh)] origin-top transition-[opacity,translate,scale] duration-140 ease-(--ease-out) starting:-translate-y-1 starting:scale-98 starting:opacity-0 motion-reduce:starting:translate-y-0 motion-reduce:starting:scale-100",
            )}
          >
            {list}
          </div>
        </div>
      </Combobox.Root>
      <p id={hintId} className="sr-only">
        With the field empty, Backspace moves to the last one chosen and Backspace again removes it.
      </p>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {pasting !== null && (
        <p className="px-1 text-muted text-sm" role="status">
          {pasting === 1 ? "Matching 1 name" : `Matching ${count(pasting)} names`}
        </p>
      )}
      {note && (
        <p id={noteId} data-slot="audience-note" className="px-1 text-ink-2 text-sm text-pretty">
          {note}
        </p>
      )}
      {problem && (
        <p id={problemId} className="px-1 text-danger-ink text-sm">
          {problem}
        </p>
      )}
    </section>
  );
}

export { AudiencePicker };
