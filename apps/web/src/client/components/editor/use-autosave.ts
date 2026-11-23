import type { HollerDraftInput, HollerOut } from "@holler/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { type EditorDraft, isBlank, toPayload } from "./draft";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Options {
  draft: EditorDraft;
  id: string | null;
  enabled: boolean;
  save: (payload: HollerDraftInput, id: string | null) => Promise<HollerOut>;
  onSaved: (saved: HollerOut, sent: EditorDraft) => void;
  beacon?: ((payload: HollerDraftInput, id: string) => void) | undefined;
}

const WAIT_MS = 700;
const RETRY_MS = 4000;

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
  useEffect(() => {
    if (!enabled || json === savedJson.current) return;
    const wait = state === "error" ? RETRY_MS : WAIT_MS;
    const timer = setTimeout(() => {
      run().catch(() => {});
    }, wait);
    return () => clearTimeout(timer);
  }, [enabled, json, state, run]);

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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!latest.current.enabled) return;
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

  const flush = useCallback(() => run(), [run]);

  return { state: dirty && state === "saved" ? ("saving" as const) : state, dirty, flush };
}
