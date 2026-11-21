import type { HollerOut } from "@holler/core";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EditorIo } from "./holler-editor";

/** The editor talking to the real API. Every write refreshes Home's lists and counts. */
export function apiIo(queryClient: QueryClient): EditorIo {
  // Home's lists and counts. A save that lands after the editor is gone, such as the one made on
  // the way out, refetches them if Home is already showing.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hollers", "list"] }),
      queryClient.invalidateQueries({ queryKey: ["hollers", "counts"] }),
    ]);
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
