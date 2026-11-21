import type {
  DirectoryOut,
  HollerSummary,
  HomeCounts,
  InstallStatus,
  OwnAnswer,
  OwnHoller,
  RecipientsOut,
  Results,
  SettingsMember,
  SettingsWorkspace,
  SharingOut,
} from "@holler/core";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";

export interface Me {
  member: {
    id: string;
    role: "owner" | "sender";
    slackUserId: string;
    name: string;
    avatarUrl: string | null;
  };
  workspace: {
    id: string;
    name: string;
    iconUrl: string | null;
    slackDomain: string | null;
    installed: boolean;
  };
  usage: {
    plan: "free" | "team";
    sentThisMonth: number;
    monthlyLimit: number | null;
    remaining: number | null;
  };
}

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: () => api<Me>("/me"),
});

export const homeCountsQuery = queryOptions({
  queryKey: ["hollers", "counts"],
  queryFn: () => api<HomeCounts>("/hollers/counts"),
});

export const hollersQuery = (
  scope: "mine" | "shared",
  filters: { tag?: string | undefined; q?: string | undefined } = {},
) =>
  queryOptions({
    queryKey: ["hollers", "list", scope, filters],
    queryFn: () => {
      const params = new URLSearchParams({ scope });
      if (filters.tag) params.set("tag", filters.tag);
      if (filters.q) params.set("q", filters.q);
      return api<{ hollers: HollerSummary[] }>(`/hollers?${params}`).then((r) => r.hollers);
    },
  });

export const resultsQuery = (id: string) =>
  queryOptions({
    queryKey: ["hollers", id, "results"],
    queryFn: () => api<Results>(`/hollers/${id}/results`),
  });

export const workspaceSettingsQuery = queryOptions({
  queryKey: ["settings", "workspace"],
  queryFn: () => api<SettingsWorkspace>("/settings/workspace"),
});

export const membersQuery = queryOptions({
  queryKey: ["settings", "members"],
  queryFn: () => api<{ members: SettingsMember[] }>("/settings/members").then((r) => r.members),
});

export const installStatusQuery = queryOptions({
  queryKey: ["install", "status"],
  queryFn: () => api<InstallStatus>("/install/status"),
});

export const hollerPeopleQuery = (id: string) =>
  queryOptions({
    queryKey: ["hollers", id, "people"],
    queryFn: () => api<RecipientsOut>(`/hollers/${id}/people`),
  });

export const sharingQuery = (id: string) =>
  queryOptions({
    queryKey: ["hollers", id, "sharing"],
    queryFn: () => api<SharingOut>(`/hollers/${id}/sharing`),
  });

export const directoryQuery = (q: string) =>
  queryOptions({
    queryKey: ["directory", q],
    queryFn: () => api<DirectoryOut>(`/directory?q=${encodeURIComponent(q)}`),
    staleTime: 60_000,
  });

export const ownAnswersQuery = queryOptions({
  queryKey: ["answers", "list"],
  queryFn: () => api<{ hollers: OwnHoller[] }>("/answers").then((r) => r.hollers),
});

export const ownAnswerQuery = (id: string) =>
  queryOptions({
    queryKey: ["answers", id],
    queryFn: () => api<OwnAnswer>(`/answers/${id}`),
  });
