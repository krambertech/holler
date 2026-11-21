import type { ApiKeyCreatedOut, ApiKeyInput, ApiKeyOut, ConnectedAppOut } from "@holler/core";
import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const apiKeysQuery = queryOptions({
  queryKey: ["settings", "api-keys"],
  queryFn: () => api<ApiKeyOut[]>("/v1/keys"),
});

export const connectedAppsQuery = queryOptions({
  queryKey: ["settings", "connected-apps"],
  queryFn: () => api<ConnectedAppOut[]>("/v1/connected-apps"),
});

export const createApiKey = (input: ApiKeyInput) =>
  api<ApiKeyCreatedOut>("/v1/keys", { method: "POST", json: input });

export const revokeApiKey = (id: string) => api(`/v1/keys/${id}`, { method: "DELETE" });

export const disconnectApp = (id: string) => api(`/v1/connected-apps/${id}`, { method: "DELETE" });

/** Where the public site documents the API and MCP. docs/api.md is the source. */
export const DOCS_URL = "https://holler.team/docs/api";
