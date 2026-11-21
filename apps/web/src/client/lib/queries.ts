import type {
  directoryOutSchema,
  HollerOut,
  HollerSummary,
  HomeCounts,
  InstallStatus,
  Results,
  SettingsMember,
  SettingsWorkspace,
} from "@holler/core";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
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

export const hollerQuery = (id: string) =>
  queryOptions({
    queryKey: ["hollers", id],
    queryFn: () => api<HollerOut>(`/hollers/${id}`),
  });

export const directoryLookupQuery = (ids: readonly string[]) =>
  queryOptions({
    queryKey: ["directory", "lookup", [...ids].sort().join(",")],
    queryFn: (): Promise<z.infer<typeof directoryOutSchema>> =>
      ids.length === 0
        ? Promise.resolve({ people: [], groups: [] })
        : api<z.infer<typeof directoryOutSchema>>(
            `/directory/lookup?ids=${encodeURIComponent(ids.join(","))}`,
          ),
    staleTime: 5 * 60_000,
  });
