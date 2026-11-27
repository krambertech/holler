import { Combobox } from "@base-ui/react/combobox";
import { Building2, Check, Hash, Users, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { Skeleton } from "@/components/skeleton";
import { Avatar } from "@/components/ui/avatar";
import {
  describedRowClassName,
  descriptionClassName,
  listRowClassName,
  touchRowClassName,
} from "@/components/ui/overlay-list";
import { cn } from "@/lib/cn";
import { count } from "@/lib/format";
import { type AudienceEntry, entryName } from "./directory";
import { isTimeZone, zoneName } from "./send-logic";
import type { ChipOverflow } from "./use-chip-overflow";

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

interface ChipProps {
  entry: AudienceEntry;
  workspaceSize: number | null | undefined;
  folded?: boolean | undefined;
  buttonRef: (button: HTMLButtonElement | null) => void;
  onRemove: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

function AudiencePickerChip({
  entry,
  workspaceSize,
  folded = false,
  buttonRef,
  onRemove,
  onKeyDown,
}: ChipProps) {
  const name = entryName(entry);
  const size = entrySize(entry, workspaceSize);
  return (
    <li
      data-slot="audience-chip"
      data-folded={folded || undefined}
      className="group/chip flex data-folded:pointer-events-none data-folded:opacity-0 h-8 max-w-full items-center gap-1.5 rounded-full bg-well ps-[3px] pe-1 font-normal text-ink text-sm transition-colors duration-150 has-focus-visible:bg-tint has-focus-visible:text-tint-ink has-focus-visible:outline-2 has-focus-visible:outline-focus has-focus-visible:outline-offset-1"
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

interface ResultProps {
  entry: AudienceEntry;
  added: boolean;
  workspaceSize: number | null | undefined;
}

function AudiencePickerResult({ entry, added, workspaceSize }: ResultProps) {
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

interface ResultsProps {
  query: string;
  loading: boolean;
  failed: boolean;
  noMatch: boolean;
  syncing: boolean;
  chosenIds: ReadonlySet<string>;
  workspaceSize: number | null | undefined;
}

function AudiencePickerResults({
  query,
  loading,
  failed,
  noMatch,
  syncing,
  chosenIds,
  workspaceSize,
}: ResultsProps) {
  return (
    <>
      {loading && <LoadingRows />}
      {failed && (
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
          <AudiencePickerResult
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
}

function AudiencePickerMore({
  overflow,
  shown,
  onOpen,
}: {
  overflow: ChipOverflow;
  shown: boolean;
  onOpen: () => void;
}) {
  if (!shown || overflow.moreAt === null) return null;
  return (
    <span
      aria-hidden
      data-slot="audience-more"
      style={{ [overflow.side]: overflow.moreAt, top: overflow.rowBottom - 32 }}
      onPointerDown={(event) => {
        event.preventDefault();
        onOpen();
      }}
      className="absolute flex h-8 items-center whitespace-nowrap rounded-full px-2.5 text-ink-2 text-sm tabular hoverable:hover:bg-hover"
    >
      +{count(overflow.hidden)} more
    </span>
  );
}

function AudiencePickerNotes({
  pasting,
  note,
  noteId,
  problem,
  problemId,
}: {
  pasting: number | null;
  note: string | null;
  noteId: string;
  problem: string | undefined;
  problemId: string;
}) {
  if (pasting === null && !note && !problem) return null;
  return (
    <div className="grid gap-1 px-4 pb-3 text-sm">
      {pasting !== null && (
        <p className="text-muted" role="status">
          {pasting === 1 ? "Matching 1 name" : `Matching ${count(pasting)} names`}
        </p>
      )}
      {note && (
        <p id={noteId} data-slot="audience-note" className="text-pretty text-ink-2">
          {note}
        </p>
      )}
      {problem && (
        <p id={problemId} className="text-danger-ink">
          {problem}
        </p>
      )}
    </div>
  );
}

function AudiencePickerFooter({ reach, children }: { reach: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-divider border-t bg-well py-1.5 ps-4 pe-3 last:rounded-b-plate">
      <span data-slot="audience-reach" className="text-muted text-sm tabular">
        {reach}
      </span>
      {children}
    </div>
  );
}

export {
  AudiencePickerFooter,
  AudiencePickerMore,
  AudiencePickerNotes,
  AudiencePickerChip,
  AudiencePickerResults,
};
