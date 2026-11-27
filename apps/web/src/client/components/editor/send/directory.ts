import type {
  Audience,
  directoryOutSchema,
  DirectoryReachOut,
  directoryResolveOutSchema,
} from "@holler/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { api } from "@/lib/api";

export type Directory = z.infer<typeof directoryOutSchema>;
export type DirectoryPerson = Directory["people"][number];
export type DirectoryGroup = Directory["groups"][number];

export type DirectorySearch = (query: string) => Promise<Directory>;

export const searchDirectory: DirectorySearch = (query) =>
  api<Directory>(`/directory?q=${encodeURIComponent(query)}`);

export type Resolved = z.infer<typeof directoryResolveOutSchema>;

export type DirectoryResolve = (terms: string[]) => Promise<Resolved>;

export const resolveDirectory: DirectoryResolve = (terms) =>
  api<Resolved>("/directory/resolve", { method: "POST", json: { terms } });

export type DirectoryCount = (audience: Audience) => Promise<DirectoryReachOut>;

export const countAudience: DirectoryCount = (audience) =>
  api<DirectoryReachOut>("/directory/reach", { method: "POST", json: audience });

export type AudienceEntry =
  | { kind: "person"; id: string; person: DirectoryPerson }
  | { kind: "group"; id: string; group: DirectoryGroup }
  | { kind: "everyone"; id: "everyone" };

export const everyoneEntry: AudienceEntry = { kind: "everyone", id: "everyone" };

export function personEntry(person: DirectoryPerson): AudienceEntry {
  return { kind: "person", id: person.slackUserId, person };
}

export function groupEntry(group: DirectoryGroup): AudienceEntry {
  return { kind: "group", id: group.slackId, group };
}

export function entryName(entry: AudienceEntry): string {
  if (entry.kind === "everyone") return "Everyone in the workspace";
  if (entry.kind === "person") return entry.person.name;
  const { group } = entry;
  if (group.kind === "channel") return `#${group.name}`;
  return group.handle ? `@${group.handle}` : group.name;
}

const ids = new WeakMap<DirectorySearch | DirectoryCount, number>();
let lastId = 0;
function idOf(source: DirectorySearch | DirectoryCount) {
  let id = ids.get(source);
  if (id === undefined) {
    lastId += 1;
    id = lastId;
    ids.set(source, id);
  }
  return id;
}

function useSettled(value: string, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function useDirectory(search: DirectorySearch, query: string, enabled: boolean) {
  const settled = useSettled(query.trim(), 150);
  const result = useQuery({
    queryKey: ["directory", idOf(search), settled],
    queryFn: () => search(settled),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const current = Boolean(result.data) && !result.isPlaceholderData && settled === query.trim();
  return { ...result, current };
}

export function audienceKey(audience: Audience): string {
  if (audience.everyone) return "everyone";
  return JSON.stringify([[...audience.groups].sort(), [...audience.people].sort()]);
}

export function useAudienceCount(count: DirectoryCount, audience: Audience, enabled: boolean) {
  return useQuery({
    queryKey: ["directory", "reach", idOf(count), audienceKey(audience)],
    queryFn: () => count(audience),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
}
