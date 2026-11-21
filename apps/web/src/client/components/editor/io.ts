import type { HollerOut } from "@holler/core";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EditorIo } from "./holler-editor";

/** The editor talking to the real API. Every write refreshes Home's lists and counts. */
export function apiIo(queryClient: QueryClient): EditorIo {
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["hollers"], refetchType: "none" });
  return {
    save: async (payload, id) => {
      const out = id
        ? await api<HollerOut>(`/hollers/${id}`, { method: "PUT", json: payload })
        : await api<HollerOut>("/hollers", { method: "POST", json: payload });
      queryClient.setQueryData(["hollers", out.id], out);
      void refresh();
      return out;
    },
    send: async (id) => {
      const out = await api<HollerOut>(`/hollers/${id}/send`, { method: "POST" });
      queryClient.setQueryData(["hollers", out.id], out);
      void refresh();
      return out;
    },
    remove: async (id) => {
      await api(`/hollers/${id}`, { method: "DELETE" });
      queryClient.removeQueries({ queryKey: ["hollers", id] });
      void refresh();
    },
    beacon: (payload, id) => {
      // keepalive lets the request finish after the tab is gone; nothing waits for its answer.
      void fetch(`/api/hollers/${id}`, {
        method: "PUT",
        credentials: "same-origin",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    },
  };
}
