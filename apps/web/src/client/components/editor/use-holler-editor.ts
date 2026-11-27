import {
  answerSurface,
  type HollerDraftInput,
  type HollerOut,
  type HollerTemplate,
  hollerTitle,
  type Mode,
} from "@holler/core";
import { useCallback, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { adoptIds, applyTemplate, composeProblems, type EditorDraft } from "./draft";
import { filled } from "./questions/model";
import type { AudienceSummary } from "./send/audience-picker";
import type { DirectoryCount, DirectorySearch } from "./send/directory";
import { type Reach, senderZoneFor } from "./send/send-logic";
import { useNow } from "./send/use-now";
import { useAutosave } from "./use-autosave";

export type EditorStage = "compose" | "send";

export interface EditorIo {
  save: (payload: HollerDraftInput, id: string | null) => Promise<HollerOut>;
  send: (id: string) => Promise<HollerOut>;
  remove: (id: string) => Promise<void>;
  beacon?: ((payload: HollerDraftInput, id: string) => void) | undefined;
  search?: DirectorySearch | undefined;
  countPeople?: DirectoryCount | undefined;
}

interface Options {
  io: EditorIo;
  initial: EditorDraft;
  saved: HollerOut | null;
  onStageChange: (stage: EditorStage) => void;
  onCreated?: ((holler: HollerOut) => void) | undefined;
  onSent?: ((holler: HollerOut) => void) | undefined;
  onDeleted?: (() => void) | undefined;
  now?: Date | undefined;
  timeZone?: string | null | undefined;
}

const noReach: Reach = { count: 0, exact: true, everyone: false, unknown: false };

function failure(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function useModeSwitch(draft: EditorDraft, update: (patch: Partial<EditorDraft>) => void) {
  const [aside, setAside] = useState<EditorDraft["questions"]>([]);
  const changeMode = (mode: Mode) => {
    if (mode === draft.mode) return;
    if (mode === "chase") {
      setAside(draft.questions);
      update({ mode, questions: [] });
    } else if (draft.mode === "chase" && aside.length > 0) {
      update({ mode, questions: aside });
      setAside([]);
    } else {
      update({ mode });
    }
  };
  return { changeMode };
}

export function useHollerEditor({
  io,
  initial,
  saved: savedAtStart,
  onStageChange,
  onCreated,
  onSent,
  onDeleted,
  now: fixedNow,
  timeZone,
}: Options) {
  const [draft, setDraft] = useState(initial);
  const [holler, setHoller] = useState<HollerOut | null>(savedAtStart);
  const [showProblems, setShowProblems] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [summary, setSummary] = useState<AudienceSummary>({
    reach: noReach,
    zones: [],
    chosen: [],
  });
  const now = useNow(fixedNow);
  const senderZone = useMemo(
    () => senderZoneFor(timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone),
    [timeZone],
  );
  const scheduled = holler?.status === "scheduled";
  const created = useRef(Boolean(savedAtStart));

  const update = useCallback((patch: Partial<EditorDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSendError(null);
  }, []);

  const onSaved = useCallback(
    (out: HollerOut, sent: EditorDraft) => {
      setHoller(out);
      if (!created.current) {
        created.current = true;
        onCreated?.(out);
      }
      if (sent.mode !== "chase") {
        setDraft((d) => ({
          ...d,
          questions: adoptIds(d.questions, sent.questions, out.questions),
        }));
      }
    },
    [onCreated],
  );

  const autosave = useAutosave({
    draft,
    id: holler?.id ?? null,
    enabled: !scheduled && !sending && !deleting,
    save: io.save,
    onSaved,
    beacon: io.beacon,
  });

  const shown = showProblems ? (holler?.problems ?? []) : [];
  const composeShown = composeProblems(shown);
  const sendShown = shown.filter((p) => !composeShown.includes(p));
  const questions = draft.questions.map(filled);
  const surface = answerSurface({ mode: draft.mode, description: draft.description, questions });
  const title = hollerTitle({ mode: draft.mode, title: draft.title, questions });
  const { changeMode } = useModeSwitch(draft, update);

  const pickTemplate = (template: HollerTemplate) => setDraft((d) => applyTemplate(d, template));

  const goTo = (next: EditorStage) => {
    onStageChange(next);
    window.scrollTo({ top: 0 });
  };

  const saveFirst = async (): Promise<HollerOut | null | undefined> => {
    try {
      return (await autosave.flush()) ?? holler;
    } catch {
      setSendError("We could not save your last changes. Check your connection and try again.");
      return undefined;
    }
  };

  const send = async () => {
    setSendError(null);
    setLimit(null);
    const out = await saveFirst();
    if (out === undefined) return;
    if (!out || out.problems.length > 0) {
      setShowProblems(true);
      if (out && composeProblems(out.problems).length > 0) goTo("compose");
      return;
    }
    if (out.status === "scheduled") return;
    setSending(true);
    try {
      onSent?.(await io.send(out.id));
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) setLimit(error.message);
      else setSendError(failure(error, "We could not send it. Try again."));
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!holler) return false;
    setDeleting(true);
    try {
      await io.remove(holler.id);
      onDeleted?.();
      return true;
    } catch (error) {
      setDeleting(false);
      setSendError(failure(error, "We could not delete it. Try again."));
      return false;
    }
  };

  const closesAt =
    draft.closesAt ?? new Date((draft.sendAt ?? now).getTime() + draft.closeAfterHours * 3_600_000);

  return {
    draft,
    update,
    holler,
    scheduled,
    autosave,
    composeShown,
    sendShown,
    surface,
    title,
    changeMode,
    pickTemplate,
    goTo,
    send,
    sending,
    sendError,
    limit,
    remove,
    deleting,
    summary,
    setSummary,
    now,
    senderZone,
    closesAt,
  };
}

export type HollerEditorState = ReturnType<typeof useHollerEditor>;
