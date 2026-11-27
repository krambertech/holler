import type { HollerDraft } from "@holler/core";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import {
  type AudienceEntry,
  audienceKey,
  countAudience,
  type DirectoryCount,
  type DirectoryGroup,
  type DirectoryPerson,
  entryName,
  everyoneEntry,
  groupEntry,
  personEntry,
  useAudienceCount,
} from "./directory";
import { audienceReach, countedReach, type Reach, reachLabel, type ZoneCount } from "./send-logic";

export type AudienceSelection = HollerDraft["audience"];

export interface AudienceSummary {
  reach: Reach;
  zones: ZoneCount[];
  chosen: AudienceEntry[];
}

interface Options {
  value: AudienceSelection;
  onChange: (next: AudienceSelection) => void;
  known?: { people?: DirectoryPerson[]; groups?: DirectoryGroup[] } | undefined;
  workspaceSize?: number | null | undefined;
  onSummaryChange?: ((summary: AudienceSummary) => void) | undefined;
  countPeople?: DirectoryCount | undefined;
  input: RefObject<HTMLInputElement | null>;
}

const someone = (id: string) =>
  personEntry({
    slackUserId: id,
    name: "Someone",
    displayName: null,
    avatarUrl: null,
    timeZone: null,
  });
const someGroup = (id: string) =>
  groupEntry({ slackId: id, kind: "usergroup", name: "A group", handle: null, memberCount: null });

function useSeen(known: Options["known"]) {
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
  return { seen, remember };
}

function zonesOf(chosen: readonly AudienceEntry[]): ZoneCount[] {
  const byZone = new Map<string | null, number>();
  for (const entry of chosen) {
    if (entry.kind !== "person") continue;
    const zone = entry.person.timeZone;
    byZone.set(zone, (byZone.get(zone) ?? 0) + 1);
  }
  return [...byZone.entries()].map(([zone, people]) => ({ zone, people }));
}

function withEntries(
  base: AudienceSelection,
  entries: readonly AudienceEntry[],
): AudienceSelection {
  if (entries.some((entry) => entry.kind === "everyone")) {
    return { people: [], groups: [], everyone: true };
  }
  const start = base.everyone ? { people: [], groups: [] } : base;
  const people = [...start.people];
  const groups = [...start.groups];
  for (const entry of entries) {
    if (entry.kind === "person" && !people.includes(entry.id)) people.push(entry.id);
    if (entry.kind === "group" && !groups.includes(entry.id)) groups.push(entry.id);
  }
  return { people, groups, everyone: false };
}

function withRestored(
  current: AudienceSelection,
  entry: AudienceEntry,
  index: number,
): AudienceSelection | null {
  if (entry.kind === "everyone") return { people: [], groups: [], everyone: true };
  if (current.everyone || [...current.people, ...current.groups].includes(entry.id)) return null;
  const groups = [...current.groups];
  const people = [...current.people];
  if (entry.kind === "group") groups.splice(index, 0, entry.id);
  else people.splice(Math.max(0, index - groups.length), 0, entry.id);
  return { people, groups, everyone: false };
}

function useReach(
  value: AudienceSelection,
  seen: ReadonlyMap<string, AudienceEntry>,
  chosen: readonly AudienceEntry[],
  workspaceSize: number | null | undefined,
  count: DirectoryCount,
) {
  const needsSlack = value.everyone || value.groups.length > 0;
  const counted = useAudienceCount(count, value, needsSlack);
  const exact = needsSlack ? counted.data : undefined;
  const reach = useMemo(() => {
    if (exact) return countedReach(value.everyone, exact.people);
    return audienceReach(
      value,
      (id) => {
        const entry = seen.get(id);
        return entry?.kind === "group" ? entry.group.memberCount : null;
      },
      workspaceSize,
    );
  }, [exact, value, seen, workspaceSize]);
  const zones = useMemo(() => exact?.zones ?? zonesOf(chosen), [exact, chosen]);
  const settled = !needsSlack || exact !== undefined || counted.isError;
  return { reach, zones, settled };
}

export function useAudienceChoice({
  value,
  onChange,
  known,
  workspaceSize,
  onSummaryChange,
  countPeople = countAudience,
  input,
}: Options) {
  const { seen, remember } = useSeen(known);
  const [announcement, setAnnouncement] = useState("");

  const chosen = useMemo<AudienceEntry[]>(() => {
    if (value.everyone) return [everyoneEntry];
    return [
      ...value.groups.map((id) => seen.get(id) ?? someGroup(id)),
      ...value.people.map((id) => seen.get(id) ?? someone(id)),
    ];
  }, [value, seen]);
  const chosenIds = useMemo(() => new Set(chosen.map((entry) => entry.id)), [chosen]);

  const { reach, zones, settled } = useReach(value, seen, chosen, workspaceSize, countPeople);

  const report = useRef(onSummaryChange);
  report.current = onSummaryChange;
  useEffect(() => {
    report.current?.({ reach, zones, chosen });
  }, [reach, zones, chosen]);

  const latest = useRef(value);
  latest.current = value;
  const lastRemoved = useRef<{ entry: AudienceEntry; index: number } | null>(null);
  const undoToast = useRef<string | null>(null);

  const [unsaid, setUnsaid] = useState<{ key: string; said: string } | null>(null);
  useEffect(() => {
    if (!unsaid || !settled || unsaid.key !== audienceKey(value)) return;
    setUnsaid(null);
    setAnnouncement(`${unsaid.said} ${reachLabel(reach)}.`);
  }, [unsaid, value, reach, settled]);

  const commit = (next: AudienceSelection, said: string) => {
    setUnsaid({ key: audienceKey(next), said });
    onChange(next);
  };

  const add = (entries: readonly AudienceEntry[], said: string) =>
    commit(withEntries(latest.current, entries), said);

  const restore = () => {
    const removed = lastRemoved.current;
    if (!removed) return;
    lastRemoved.current = null;
    if (undoToast.current) toast.close(undoToast.current);
    const next = withRestored(latest.current, removed.entry, removed.index);
    if (next) commit(next, `${entryName(removed.entry)} is back.`);
  };

  const remove = (entry: AudienceEntry) => {
    const index = chosen.findIndex((other) => other.id === entry.id);
    lastRemoved.current = { entry, index };
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

  return {
    seen,
    remember,
    chosen,
    chosenIds,
    reach,
    announcement,
    setAnnouncement,
    add,
    remove,
    restore,
  };
}

export function useCloseOnOutside(
  open: boolean,
  frame: RefObject<HTMLElement | null>,
  close: () => void,
) {
  const latestClose = useRef(close);
  latestClose.current = close;
  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null) =>
      target instanceof Node && !frame.current?.contains(target);
    const onPointerDown = (event: PointerEvent) => {
      if (outside(event.target)) latestClose.current();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (outside(event.target)) latestClose.current();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open, frame]);
}
