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
  const latest = useRef({ draft, json, id, save, onSaved, beacon });
  latest.current = { draft, json, id, save, onSaved, beacon };
  const running = useRef<Promise<HollerOut | null> | null>(null);

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
        latest.current.onSaved(out, sent);
        setState(latest.current.json === sentJson ? "saved" : "saving");
        return out;
      } catch (error) {
        setState("error");
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

  /** Saves now, whatever the wait, and resolves with the saved Holler or null if nothing changed. */
  const flush = useCallback(() => run(), [run]);

  return { state: dirty && state === "saved" ? ("saving" as const) : state, dirty, flush };
}
