import type { HollerDraftInput, HollerOut } from "@holler/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { type EditorDraft, isBlank, toPayload } from "./draft";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Options {
  draft: EditorDraft;
  /** Null until the first save makes the draft. */
  id: string | null;
  /** False while the Holler is scheduled: its edits wait for Update schedule. */
  enabled: boolean;
  save: (payload: HollerDraftInput, id: string | null) => Promise<HollerOut>;
  onSaved: (saved: HollerOut, sent: EditorDraft) => void;
  /** The last save, read when the tab closes. */
  beacon?: ((payload: HollerDraftInput, id: string) => void) | undefined;
}

const WAIT_MS = 700;
const RETRY_MS = 4000;

/**
 * Saves the draft as the sender types: a moment after the last change, one save at a time, and
 * once more when the tab is hidden. An untouched new Holler makes no draft. A failed save tries
 * again on its own and says so.
 */
export function useAutosave({ draft, id, enabled, save, onSaved, beacon }: Options) {
  const json = JSON.stringify(toPayload(draft));
  const [state, setState] = useState<SaveState>(id ? "saved" : "idle");
  const savedJson = useRef<string | null>(id ? json : null);
  const latest = useRef({ draft, json, id, enabled, save, onSaved, beacon });
  latest.current = { draft, json, id, enabled, save, onSaved, beacon };
  const running = useRef<Promise<HollerOut | null> | null>(null);
  const mounted = useRef(true);

  const run = useCallback(async (): Promise<HollerOut | null> => {
    if (running.current) {
      await running.current;
      return run();
    }
    const { draft: sent, json: sentJson, id: currentId, save: doSave } = latest.current;
    if (sentJson === savedJson.current) return null;
    if (!currentId && isBlank(sent)) return null;
    setState("saving");
    const attempt = (async () => {
      try {
        const out = await doSave(toPayload(sent), currentId);
        savedJson.current = sentJson;
        // Gone already: the save still lands, but the page it would update is not there.
        if (!mounted.current) return out;
        latest.current.onSaved(out, sent);
        setState(latest.current.json === sentJson ? "saved" : "saving");
        return out;
      } catch (error) {
        if (mounted.current) setState("error");
        throw error;
      }
    })();
    running.current = attempt;
    try {
      return await attempt;
    } finally {
      running.current = null;
    }
  }, []);

  const dirty = json !== savedJson.current;
  // Every change restarts the wait, so a save goes a moment after the typing stops.
  useEffect(() => {
    if (!enabled || json === savedJson.current) return;
    const wait = state === "error" ? RETRY_MS : WAIT_MS;
    const timer = setTimeout(() => {
      run().catch(() => {});
    }, wait);
    return () => clearTimeout(timer);
  }, [enabled, json, state, run]);

  // Closing the tab mid-edit: one last save that does not wait for an answer.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      if (document.visibilityState !== "hidden") return;
      const { json: now, id: currentId, draft: current, beacon: send } = latest.current;
      if (!currentId || !send || now === savedJson.current) return;
      send(toPayload(current), currentId);
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [enabled]);

  // Leaving the editor inside the wait, by a link in the app: save what is left on the way out.
  // A client-side navigation keeps the page visible, so the visibility save above never fires.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A scheduled Holler's edits wait for Update schedule, so leaving drops them on purpose.
      if (!latest.current.enabled) return;
      // React's development double mount runs this and mounts again at once: that is no leaving.
      queueMicrotask(() => {
        if (mounted.current) return;
        leave();
      });
    };
    function leave() {
      const { draft: current, json: now, id: currentId, save: doSave } = latest.current;
      const last = (savedId: string | null) => {
        if (now === savedJson.current) return;
        if (!savedId && isBlank(current)) return;
        savedJson.current = now;
        void doSave(toPayload(current), savedId).catch(() => {});
      };
      const pending = running.current;
      if (pending) {
        pending.then(
          (out) => last(out?.id ?? currentId),
          () => last(currentId),
        );
      } else {
        last(currentId);
      }
    }
  }, []);

  /** Saves now, whatever the wait, and resolves with the saved Holler or null if nothing changed. */
  const flush = useCallback(() => run(), [run]);

  return { state: dirty && state === "saved" ? ("saving" as const) : state, dirty, flush };
}
