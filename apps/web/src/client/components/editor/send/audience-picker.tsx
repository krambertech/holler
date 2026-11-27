import { Combobox } from "@base-ui/react/combobox";
import type { BaseUIEvent } from "@base-ui/react/types";
import {
  type ClipboardEvent,
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { controlText } from "@/components/ui/input";
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
import { AudiencePickerChip, AudiencePickerResults } from "./audience-rows";
import {
  type AudienceEntry,
  type DirectoryCount,
  type DirectoryGroup,
  type DirectoryPerson,
  type DirectoryResolve,
  type DirectorySearch,
  entryName,
  groupEntry,
  personEntry,
  resolveDirectory,
  searchDirectory,
  useDirectory,
} from "./directory";
import { reachLabel } from "./send-logic";
import {
  type AudienceSelection,
  type AudienceSummary,
  useAudienceChoice,
  useCloseOnOutside,
} from "./use-audience-choice";

export type { AudienceSummary };

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
  countPeople?: DirectoryCount | undefined;
  defaultInputValue?: string | undefined;
  inline?: boolean | undefined;
}

const MAX_ROWS = 30;

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
  countPeople,
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
  const [note, setNote] = useState<string | null>(null);
  const [pasting, setPasting] = useState<number | null>(null);
  const choice = useAudienceChoice({
    value,
    onChange,
    known,
    workspaceSize,
    onSummaryChange,
    countPeople,
    input,
  });
  const { seen, remember, chosen, chosenIds, reach, add, remove: removeEntry, restore } = choice;

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

  useCloseOnOutside(open, frame, () => setOpen(false));

  const pick = (entry: AudienceEntry) => {
    setNote(null);
    if (chosenIds.has(entry.id)) {
      choice.setAnnouncement(`${entryName(entry)} is already in.`);
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

  const remove = (entry: AudienceEntry) => {
    setNote(null);
    removeEntry(entry);
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
        if (!fresh.length) choice.setAnnouncement(`${pastedSentence(0)} ${missed ?? ""}`.trim());
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
          Who gets it
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
                  <AudiencePickerChip
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
            <AudiencePickerResults
              query={query}
              loading={!directory.current && !directory.isError && matches.length === 0}
              failed={directory.isError && !directory.current}
              noMatch={Boolean(directory.current && typed && matches.length === 0)}
              syncing={Boolean(directory.data?.syncing)}
              chosenIds={chosenIds}
              workspaceSize={workspaceSize}
            />
          </div>
        </div>
      </Combobox.Root>
      <p id={hintId} className="sr-only">
        With the field empty, Backspace moves to the last one chosen and Backspace again removes it.
      </p>
      <p className="sr-only" role="status">
        {choice.announcement}
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
