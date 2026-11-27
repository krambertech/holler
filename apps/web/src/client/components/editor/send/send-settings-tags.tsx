import { Combobox } from "@base-ui/react/combobox";
import { Plus, X } from "lucide-react";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { controlBase, controlText } from "@/components/ui/input";
import {
  choicePopupClassName,
  listRowClassName,
  touchRowClassName,
} from "@/components/ui/overlay-list";
import { cn } from "@/lib/cn";

const MAX_TAGS = 10;

type TagItem = { tag: string; create: boolean };

function itemsFor(suggestions: string[], tags: string[], typed: string): TagItem[] {
  const unused = [...new Set(suggestions.map((t) => t.toLocaleLowerCase()))].filter(
    (t) => !tags.includes(t),
  );
  const matching = unused.filter((t) => t.includes(typed)).map((tag) => ({ tag, create: false }));
  const exists = typed === "" || tags.includes(typed) || unused.includes(typed);
  return exists ? matching : [...matching, { tag: typed, create: true }];
}

function SendSettingsTags({
  tags,
  suggestions,
  onTags,
}: {
  tags: string[];
  suggestions: string[];
  onTags: (tags: string[]) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const typed = query.trim().toLocaleLowerCase().slice(0, 40);
  const items = useMemo(() => itemsFor(suggestions, tags, typed), [suggestions, tags, typed]);
  const full = tags.length >= MAX_TAGS;
  const listed = open && items.length > 0;

  const add = (tag: string) => {
    setQuery("");
    if (!tag || tags.includes(tag) || full) return;
    onTags([...tags, tag]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !listed) {
      event.preventDefault();
      add(typed);
    } else if (event.key === "Backspace" && query === "" && tags.length > 0) {
      onTags(tags.slice(0, -1));
    }
  };

  return (
    <div data-slot="send-settings-tags" className="grid gap-1.5 sm:max-w-md">
      <Combobox.Root<TagItem, true>
        multiple
        items={items}
        filter={null}
        value={[]}
        onValueChange={(picked) => add(picked.at(-1)?.tag ?? "")}
        inputValue={query}
        onInputValueChange={(next) => {
          const parts = next.split(",");
          const rest = parts.pop() ?? "";
          const added = parts.map((p) => p.trim().toLocaleLowerCase().slice(0, 40)).filter(Boolean);
          if (added.length > 0) onTags([...new Set([...tags, ...added])].slice(0, MAX_TAGS));
          setQuery(rest);
          setOpen(true);
        }}
        open={listed}
        onOpenChange={setOpen}
        isItemEqualToValue={(a, b) => a.tag === b.tag}
        itemToStringLabel={(item) => item.tag}
        autoHighlight
      >
        <div ref={frame} className="relative">
          <div
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              input.current?.focus();
            }}
            className={cn(
              controlBase,
              "flex min-h-11 cursor-text flex-wrap items-center gap-1.5 p-1.5 focus-within:edge-2 md:min-h-10",
            )}
          >
            {tags.length > 0 && (
              <ul aria-label="Tags" className="contents">
                {tags.map((tag) => (
                  <li
                    key={tag}
                    className="flex h-7 items-center gap-1 rounded-full bg-well ps-2.5 pe-0.5 text-ink text-sm"
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
            <Combobox.Input
              ref={input}
              aria-label="Add a tag"
              placeholder={tags.length > 0 ? "Add another" : "Type a tag"}
              maxLength={40}
              disabled={full}
              enterKeyHint="done"
              autoComplete="off"
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              className={cn(
                controlText,
                "h-7 min-w-[10ch] flex-1 bg-transparent px-1.5 text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed",
              )}
            />
          </div>
        </div>
        <Combobox.Portal>
          <Combobox.Positioner
            anchor={frame}
            side="bottom"
            align="start"
            sideOffset={6}
            className="isolate z-(--z-dropdown) outline-none"
          >
            <Combobox.Popup
              aria-label="Tags you can add"
              className={cn(
                choicePopupClassName,
                "flex max-h-[min(16rem,var(--available-height))] w-(--anchor-width) flex-col overflow-hidden",
              )}
            >
              <Combobox.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 outline-none">
                {(item: TagItem) => (
                  <Combobox.Item
                    key={`${item.create}-${item.tag}`}
                    value={item}
                    className={cn(listRowClassName, touchRowClassName)}
                  >
                    {item.create && <Plus aria-hidden className="size-4 text-muted" />}
                    {item.create ? `Make the tag “${item.tag}”` : item.tag}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {full && <p className="text-muted text-sm">That is the most tags one Holler can have.</p>}
    </div>
  );
}

export { SendSettingsTags };
