import {
  answerSurface,
  type HollerDraftInput,
  type HollerOut,
  type HollerTemplate,
  hollerTitle,
  type Mode,
} from "@holler/core";
import { ArrowLeft, CalendarClock, Check, CircleAlert, LoaderCircle } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { LimitReached } from "@/components/billing/limit-reached";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { questionsLabel } from "@/lib/format";
import {
  adoptIds,
  applyTemplate,
  composeProblems,
  type EditorDraft,
  problemFor,
  questionProblems,
} from "./draft";
import { ModePicker } from "./mode-picker";
import { filled } from "./questions/model";
import { QuestionList } from "./questions/question-list";
import { AudiencePicker, type AudienceSummary } from "./send/audience-picker";
import type { DirectoryGroup, DirectoryPerson, DirectorySearch } from "./send/directory";
import { SendBar, SendButton } from "./send/send-bar";
import {
  composeBarSummary,
  dayTime,
  type Reach,
  sendActionLabel,
  sendBarSummary,
} from "./send/send-logic";
import { SendSettings } from "./send/send-settings";
import { SlackPreview } from "./send/slack-preview";
import { useNow } from "./send/use-now";
import { TemplatesDialog } from "./templates-dialog";
import { type SaveState, useAutosave } from "./use-autosave";

export type EditorStage = "compose" | "send";

export interface EditorIo {
  save: (payload: HollerDraftInput, id: string | null) => Promise<HollerOut>;
  send: (id: string) => Promise<HollerOut>;
  remove: (id: string) => Promise<void>;
  beacon?: ((payload: HollerDraftInput, id: string) => void) | undefined;
  search?: DirectorySearch | undefined;
}

interface Props {
  io: EditorIo;
  initial: EditorDraft;
  saved?: HollerOut | null | undefined;
  stage: EditorStage;
  onStageChange: (stage: EditorStage) => void;
  sender: string;
  workspaceSize?: number | null | undefined;
  known?: { people?: DirectoryPerson[]; groups?: DirectoryGroup[] } | undefined;
  tagSuggestions?: string[] | undefined;
  onCreated?: ((holler: HollerOut) => void) | undefined;
  onSent?: ((holler: HollerOut) => void) | undefined;
  onDeleted?: (() => void) | undefined;
  backLink: ReactNode;
  now?: Date | undefined;
}

const noReach: Reach = { count: 0, exact: true, everyone: false, unknown: false };

function SaveStatus({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span aria-live="polite" className="inline-flex items-center gap-1.5 text-muted text-sm">
      {state === "saving" && (
        <>
          <LoaderCircle aria-hidden size={14} className="animate-spin motion-reduce:animate-none" />
          Saving
        </>
      )}
      {state === "saved" && (
        <>
          <Check aria-hidden size={14} strokeWidth={2} />
          Draft saved
        </>
      )}
      {state === "error" && (
        <span className="inline-flex items-center gap-1.5 text-danger-ink">
          <CircleAlert aria-hidden size={14} strokeWidth={2} />
          Could not save. Trying again
        </span>
      )}
    </span>
  );
}

function StageNav({
  stage,
  onStage,
  composeFlagged,
  sendFlagged,
}: {
  stage: EditorStage;
  onStage: (stage: EditorStage) => void;
  composeFlagged: boolean;
  sendFlagged: boolean;
}) {
  const steps: { id: EditorStage; label: string; flagged: boolean }[] = [
    { id: "compose", label: "Compose", flagged: composeFlagged },
    { id: "send", label: "Send", flagged: sendFlagged },
  ];
  return (
    <nav aria-label="Steps" className="flex items-center gap-1">
      {steps.map((step, index) => {
        const current = step.id === stage;
        return (
          <div key={step.id} className="flex items-center gap-1">
            {index > 0 && <span aria-hidden className="h-px w-5 bg-edge-3" />}
            <button
              type="button"
              aria-current={current ? "step" : undefined}
              onClick={() => onStage(step.id)}
              className={cn(
                "relative inline-flex h-9 items-center gap-2 rounded-full ps-1 pe-3 text-base outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus pointer-coarse:before:absolute pointer-coarse:before:-inset-1 pointer-coarse:before:content-['']",
                current ? "bg-plate text-ink edge" : "text-muted hoverable:hover:bg-hover",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-7 place-items-center rounded-full text-sm tabular",
                  step.flagged
                    ? "bg-danger text-danger-ink"
                    : current
                      ? "bg-primary text-on-primary"
                      : "bg-well text-ink-2",
                )}
              >
                {step.flagged ? <CircleAlert size={14} strokeWidth={2} /> : index + 1}
              </span>
              {step.label}
              {step.flagged && <span className="sr-only">, has something to fix</span>}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

const bareTitle =
  "w-full border-0 bg-transparent p-0 text-3xl tracking-title text-ink outline-none placeholder:text-muted";
const bareIntro =
  "w-full resize-none border-0 bg-transparent p-0 text-ink-2 outline-none placeholder:text-muted field-sizing-content";

function HollerEditor({
  io,
  initial,
  saved: savedAtStart = null,
  stage,
  onStageChange,
  sender,
  workspaceSize,
  known,
  tagSuggestions,
  onCreated,
  onSent,
  onDeleted,
  backLink,
  now: fixedNow,
}: Props) {
  const [draft, setDraft] = useState(initial);
  const [holler, setHoller] = useState<HollerOut | null>(savedAtStart);
  const [aside, setAside] = useState<EditorDraft["questions"]>([]);
  const [showProblems, setShowProblems] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [summary, setSummary] = useState<AudienceSummary>({
    reach: noReach,
    zones: [],
    chosen: [],
  });
  const [customTitle, setCustomTitle] = useState(initial.mode === "pulse" && !!initial.title);
  const now = useNow(fixedNow);
  const senderZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

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

  const problems = holler?.problems ?? [];
  const shown = showProblems ? problems : [];
  const composeShown = composeProblems(shown);
  const sendShown = shown.filter((p) => !composeShown.includes(p));

  const surface = answerSurface({
    mode: draft.mode,
    description: draft.description,
    questions: draft.questions.map(filled),
  });
  const title = hollerTitle({
    mode: draft.mode,
    title: draft.title,
    questions: draft.questions.map(filled),
  });

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

  const pickTemplate = (template: HollerTemplate) => {
    setTemplatesOpen(false);
    setDraft((d) => applyTemplate(d, template));
  };

  const goTo = (next: EditorStage) => {
    onStageChange(next);
    window.scrollTo({ top: 0 });
  };

  const send = async () => {
    setSendError(null);
    setLimit(null);
    let out: HollerOut | null;
    try {
      out = (await autosave.flush()) ?? holler;
    } catch {
      setSendError("We could not save your last changes. Check your connection and try again.");
      return;
    }
    if (!out) {
      setShowProblems(true);
      return;
    }
    if (out.problems.length > 0) {
      setShowProblems(true);
      if (composeProblems(out.problems).length > 0) goTo("compose");
      return;
    }
    if (scheduled) return;
    setSending(true);
    try {
      const sent = await io.send(out.id);
      onSent?.(sent);
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) setLimit(error.message);
      else
        setSendError(error instanceof Error ? error.message : "We could not send it. Try again.");
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!holler) return;
    setDeleting(true);
    try {
      await io.remove(holler.id);
      onDeleted?.();
    } catch (error) {
      setDeleting(false);
      setAskDelete(false);
      setSendError(error instanceof Error ? error.message : "We could not delete it. Try again.");
    }
  };

  const closesAt =
    draft.closesAt ?? new Date((draft.sendAt ?? now).getTime() + draft.closeAfterHours * 3_600_000);

  const preview = (
    <SlackPreview
      holler={{
        mode: draft.mode,
        title: title || "Untitled",
        description: draft.description,
        anonymous: draft.anonymous,
        questions: draft.questions.map(filled),
      }}
      sender={sender}
      closesAt={closesAt}
      sendsAt={draft.sendAt}
    />
  );

  const composeProblem = composeShown[0]?.message;
  const composeBar = composeBarSummary(surface, draft.questions.length, composeProblem);
  const sendBar = sendBarSummary(summary.reach, draft, { now, senderZone, zones: summary.zones });
  const sendProblem = sendError ?? sendShown[0]?.message ?? composeShown[0]?.message;
  const bar =
    stage === "compose"
      ? {
          title: composeBar.title,
          description:
            draft.mode === "chase"
              ? null
              : (composeBar.description ??
                (composeProblem && composeShown.length > 1
                  ? `${composeShown.length - 1} more to fix`
                  : null)),
          tone: composeBar.tone,
          action: "Next: who and when",
          onAction: () => goTo("send"),
          send: undefined,
        }
      : {
          title: sendProblem ?? sendBar.title,
          description: sendProblem ? null : sendBar.description,
          tone: sendProblem ? ("danger" as const) : undefined,
          action: scheduled ? "Update schedule" : sendActionLabel(summary.reach, !!draft.sendAt),
          onAction: () => {
            if (scheduled) autosave.flush().catch(() => {});
            else void send();
          },
          send: scheduled
            ? undefined
            : {
                title: title || "Untitled",
                reach: summary.reach,
                chosen: summary.chosen,
                when: draft.sendAt ? dayTime(draft.sendAt) : "now",
                scheduled: !!draft.sendAt,
              },
        };

  const qProblems = questionProblems(composeShown);
  const titleProblem = problemFor(composeShown, "title");
  const linkProblem = problemFor(composeShown, "externalUrl");

  return (
    <div data-slot="holler-editor" className="flex flex-col gap-7">
      <div className="flex min-h-9 items-center justify-between gap-4">
        {backLink}
        <div className="flex items-center gap-3">
          <SaveStatus state={scheduled && autosave.dirty ? "idle" : autosave.state} />
          {holler?.status === "draft" && (
            <Button variant="ghost" size="sm" onClick={() => setAskDelete(true)}>
              Delete draft
            </Button>
          )}
        </div>
      </div>

      <header className="flex flex-col gap-5">
        <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-4xl tracking-title">
          {scheduled ? "Scheduled" : "New"}
          <ModePicker
            mode={draft.mode}
            onChange={changeMode}
            questionCount={draft.questions.length}
          />
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StageNav
            stage={stage}
            onStage={goTo}
            composeFlagged={composeShown.length > 0}
            sendFlagged={sendShown.length > 0}
          />
          {preview}
        </div>
      </header>

      {scheduled && (
        <Notice
          icon={<CalendarClock />}
          title={draft.sendAt ? `Sends ${dayTime(draft.sendAt)}` : "Scheduled to send"}
          description="Edits wait until you press Update schedule, so a half-finished change never goes out."
        />
      )}

      {stage === "compose" ? (
        <div className="flex flex-col gap-7">
          {draft.mode !== "pulse" && (
            <div className="flex flex-col gap-2">
              <Field invalid={Boolean(titleProblem)}>
                <FieldLabel className="sr-only">Title</FieldLabel>
                <input
                  value={draft.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder={
                    draft.mode === "chase" ? "What should people fill in?" : "Give it a title"
                  }
                  maxLength={150}
                  className={bareTitle}
                />
                <FieldError>{titleProblem}</FieldError>
              </Field>
              <textarea
                aria-label="Intro"
                value={draft.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="Add a line of context (optional)"
                rows={1}
                maxLength={4000}
                className={bareIntro}
              />
            </div>
          )}

          {draft.mode === "chase" ? (
            <div className="flex flex-col gap-4">
              <Field invalid={Boolean(linkProblem)}>
                <FieldLabel>Link to the form</FieldLabel>
                <Input
                  type="url"
                  inputMode="url"
                  value={draft.externalUrl ?? ""}
                  onChange={(e) => update({ externalUrl: e.target.value })}
                  placeholder="https://forms.gle/…"
                />
                <FieldError>{linkProblem}</FieldError>
              </Field>
              <p className="max-w-[60ch] text-muted text-sm">
                People get the link and an I submitted it button. Holler reminds everyone who has
                not pressed it until it closes.
              </p>
              {aside.length > 0 && (
                <Notice
                  icon={<CircleAlert />}
                  title={`Your ${questionsLabel(aside.length).toLocaleLowerCase()} are set aside`}
                  description="A chase has no questions. Switch back to a pulse or a survey on this page to keep them."
                />
              )}
            </div>
          ) : (
            <QuestionList
              mode={draft.mode}
              questions={draft.questions}
              onChange={(questions) => update({ questions })}
              problems={qProblems}
              onTemplates={() => setTemplatesOpen(true)}
              onMakeSurvey={() => changeMode("survey")}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {draft.mode === "pulse" && (
            <section aria-labelledby="editor-title" className="flex flex-col gap-2 px-1">
              <h2 id="editor-title" className="text-muted text-sm">
                Title
              </h2>
              {customTitle ? (
                <Input
                  aria-labelledby="editor-title"
                  value={draft.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder={hollerTitle({
                    ...draft,
                    title: "",
                    questions: draft.questions.map(filled),
                  })}
                  maxLength={150}
                  autoFocus
                />
              ) : (
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-lg">{title || "Your first question"}</span>
                  <button
                    type="button"
                    onClick={() => setCustomTitle(true)}
                    className="rounded-sm text-sm text-tint-ink outline-none focus-visible:ring-2 focus-visible:ring-focus hoverable:hover:underline"
                  >
                    Use a different title
                  </button>
                </p>
              )}
            </section>
          )}
          <AudiencePicker
            value={draft.audience}
            onValueChange={(audience) => update({ audience })}
            problem={problemFor(sendShown, "audience")}
            known={known}
            workspaceSize={workspaceSize}
            onSummaryChange={setSummary}
            search={io.search}
          />
          <SendSettings
            value={draft}
            onValueChange={(fields) => update(fields)}
            problems={{
              sendAt: problemFor(sendShown, "sendAt"),
              closesAt:
                problemFor(sendShown, "closesAt") ?? problemFor(sendShown, "closeAfterHours"),
            }}
            reach={summary.reach}
            zones={summary.zones}
            tagSuggestions={tagSuggestions}
            knownChannels={known?.groups?.filter((g) => g.kind === "channel")}
            search={io.search}
            now={now}
            timeZone={senderZone}
          />
          {limit !== null && <LimitReached fallbackMessage={limit} />}
        </div>
      )}

      <SendBar
        description={bar.description}
        tone={bar.tone}
        action={
          stage === "send" && !scheduled ? (
            <SendButton send={bar.send} onSend={bar.onAction} pending={sending}>
              {bar.action}
            </SendButton>
          ) : (
            <Button variant="primary" onClick={bar.onAction}>
              {bar.action}
            </Button>
          )
        }
      >
        {bar.title}
      </SendBar>

      <TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} onUse={pickTemplate} />

      <Dialog open={askDelete} onOpenChange={setAskDelete}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete this draft?</DialogTitle>
            <DialogDescription>
              It has not been sent, so nobody has seen it. Deleting it cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Keep it</Button>} />
            <Button variant="primary" pending={deleting} onClick={() => void remove()}>
              Delete draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackLabel() {
  return (
    <>
      <ArrowLeft aria-hidden size={16} strokeWidth={2} />
      Your hollers
    </>
  );
}

export { BackLabel, HollerEditor };
