import { Combobox } from "@base-ui/react/combobox";
import type { BaseUIEvent } from "@base-ui/react/types";
import { EASE_OUT } from "@holler/design";
import { motion } from "motion/react";
import {
  type ClipboardEvent,
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { controlText } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useControllableState } from "@/lib/use-controllable-state";
import { useReduceMotion } from "@/lib/use-reduce-motion";
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
  AudiencePickerChip,
  AudiencePickerFooter,
  AudiencePickerMore,
  AudiencePickerNotes,
  AudiencePickerResults,
} from "./audience-rows";
import {
  type AudienceEntry,
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
import { useChipOverflow } from "./use-chip-overflow";

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
  defaultInputValue?: string | undefined;
  inline?: boolean | undefined;
  aside?: ReactNode | undefined;
  notice?: ReactNode | undefined;
}

const MAX_ROWS = 30;

function cardClassName(invalid: boolean, className: string | undefined) {
  return cn(
    "rounded-plate bg-plate edge transition-[box-shadow] duration-150 has-[[data-slot=audience-field]:focus-within]:edge-2",
    invalid && "edge-danger has-[[data-slot=audience-field]:focus-within]:edge-danger",
    className,
  );
}

function inputClassName(collapsed: boolean) {
  return cn(
    controlText,
    "h-8 min-w-[8ch] flex-1 bg-transparent px-1.5 text-ink outline-none placeholder:text-muted",
    collapsed && "sr-only",
  );
}

function resultsClassName(inline: boolean) {
  return cn(
    "col-span-2 floating flex flex-col overflow-hidden rounded-md text-ink",
    inline
      ? "mt-1.5 mb-2.5 max-h-[24rem]"
      : "absolute inset-x-0 top-full z-(--z-dropdown) mt-1.5 max-h-[min(24rem,55dvh)] origin-top transition-[opacity,translate,scale] duration-140 ease-(--ease-out) starting:-translate-y-1 starting:scale-98 starting:opacity-0 motion-reduce:starting:translate-y-0 motion-reduce:starting:scale-100",
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
  aside,
  notice,
  className,
  ...props
}: Props) {
  const [value, onChange] = useControllableState({
    value: valueProp,
    defaultValue,
    onChange: onChangeProp,
  });
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
  const [focused, setFocused] = useState(false);
  const reduce = useReduceMotion();
  const choice = useAudienceChoice({
    value,
    onChange,
    known,
    workspaceSize,
    onSummaryChange,
    input,
  });
  const { seen, remember, chosen, chosenIds, reach, add, remove: removeEntry, restore } = choice;
  const overflow = useChipOverflow(field, chosen.length);

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
  const collapsed = !focused && !open && overflow.hidden > 0;

  return (
    <section
      data-slot="audience-picker"
      data-collapsed={collapsed || undefined}
      aria-label="Audience"
      className={cardClassName(Boolean(problem), className)}
      {...props}
    >
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
        <div
          ref={frame}
          className="relative grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-2 ps-4 pe-2"
          onFocus={() => setFocused(true)}
          onBlur={(event) => {
            if (!frame.current?.contains(event.relatedTarget as Node | null)) setFocused(false);
          }}
        >
          <span aria-hidden className={cn(controlText, "flex h-12 items-center text-muted")}>
            To
          </span>
          <motion.div
            initial={false}
            animate={{ height: collapsed ? overflow.rowBottom + 8 : "auto" }}
            transition={reduce ? { duration: 0 } : { duration: 0.22, ease: EASE_OUT }}
            className="min-w-0 overflow-hidden"
          >
            <div
              ref={field}
              data-slot="audience-field"
              onPointerDown={onFieldPointerDown}
              className={cn(
                "relative flex min-h-12 cursor-text flex-wrap items-center gap-1.5 py-2",
                collapsed ? "overflow-hidden" : "max-h-[min(15rem,45dvh)] overflow-y-auto",
              )}
            >
              {chosen.length > 0 && (
                <ul aria-label="Chosen" className="contents">
                  {chosen.map((entry, index) => (
                    <AudiencePickerChip
                      key={entry.id}
                      entry={entry}
                      workspaceSize={workspaceSize}
                      folded={collapsed && index >= overflow.shown}
                      buttonRef={(button) => {
                        chipButtons.current[index] = button;
                      }}
                      onRemove={() => remove(entry)}
                      onKeyDown={onChipKey(index)}
                    />
                  ))}
                </ul>
              )}
              <AudiencePickerMore
                overflow={overflow}
                shown={collapsed}
                onOpen={() => input.current?.focus()}
              />
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
                className={inputClassName(collapsed)}
              />
            </div>
          </motion.div>
          <div data-slot="audience-results" hidden={!open} className={resultsClassName(inline)}>
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
      <AudiencePickerNotes
        pasting={pasting}
        note={note}
        noteId={noteId}
        problem={problem}
        problemId={problemId}
      />
      <AudiencePickerFooter reach={reachLabel(reach)}>{aside}</AudiencePickerFooter>
      {notice}
    </section>
  );
}

export { AudiencePicker };
