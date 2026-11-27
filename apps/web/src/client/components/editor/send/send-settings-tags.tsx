import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { controlBase } from "@/components/ui/input";
import { cn } from "@/lib/cn";

const MAX_TAGS = 10;

type TagItem = { tag: string; create: boolean };

function SendSettingsTags({
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
    <div className="grid gap-1.5 sm:max-w-sm">
      <span className="text-ink-2 text-sm">Tags</span>
      <div
        className={cn(
          controlBase,
          "flex min-h-11 flex-wrap items-center gap-1.5 p-1.5 md:min-h-10",
        )}
      >
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
            className="relative inline-flex h-8 items-center gap-1.5 rounded-sm px-1.5 text-muted outline-none transition-colors hoverable:hover:bg-hover hoverable:hover:text-ink focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50 data-popup-open:bg-hover data-popup-open:text-ink pointer-coarse:before:absolute pointer-coarse:before:-inset-y-1.5 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']"
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
      {full && <p className="text-muted text-sm">That is the most tags one Holler can have.</p>}
    </div>
  );
}

export { SendSettingsTags };
