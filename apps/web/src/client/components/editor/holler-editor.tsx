import type { HollerOut } from "@holler/core";
import { CalendarClock, Eye, Send, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Notice } from "@/components/notice";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { type EditorDraft, problemFor } from "./draft";
import { HollerEditorTags } from "./holler-editor-tags";
import { HollerEditorTop } from "./holler-editor-top";
import { HollerEditorWrite } from "./holler-editor-write";
import { ModePicker } from "./mode-picker";
import { filled } from "./questions/model";
import { AudiencePicker } from "./send/audience-picker";
import { type DirectoryGroup, type DirectoryPerson, searchDirectory } from "./send/directory";
import { SendBar, SendSplit } from "./send/send-bar";
import { SendBarAnsweredIn } from "./send/send-bar-answered-in";
import { SendDialog, type SendKind } from "./send/send-dialog";
import { anonymousWarning, composeBarSummary, dayTime, sendBarSummary } from "./send/send-logic";
import { SlackPreview } from "./send/slack-preview";
import { TemplatesDialog } from "./templates-dialog";
import { type EditorIo, type HollerEditorState, useHollerEditor } from "./use-holler-editor";

export type { EditorIo };

interface Props {
  io: EditorIo;
  initial: EditorDraft;
  saved?: HollerOut | null | undefined;
  sender: string;
  workspaceSize?: number | null | undefined;
  known?: { people?: DirectoryPerson[]; groups?: DirectoryGroup[] } | undefined;
  tagSuggestions?: string[] | undefined;
  onCreated?: ((holler: HollerOut) => void) | undefined;
  onSent?: ((holler: HollerOut) => void) | undefined;
  onDeleted?: (() => void) | undefined;
  backLink: ReactNode;
  now?: Date | undefined;
  timeZone?: string | null | undefined;
}

const dialogFields = new Set(["sendAt", "closesAt", "closeAfterHours"]);

function bar(editor: HollerEditorState) {
  const { draft, composeShown, sendShown, surface, scheduled, summary, now, senderZone } = editor;
  const problem =
    composeShown[0]?.message ?? sendShown.find((p) => !dialogFields.has(p.field ?? ""))?.message;
  if (problem) {
    const all = composeShown.length + sendShown.length;
    const more = all > 1 ? `${all - 1} more to fix` : null;
    return { title: problem, description: more, tone: "danger" as const };
  }
  if (scheduled) {
    const when = sendBarSummary(summary.reach, draft, { now, senderZone, zones: summary.zones });
    return { title: when.title, description: when.description, tone: undefined };
  }
  const counted = composeBarSummary(surface, draft.questions.length);
  return {
    title: <SendBarAnsweredIn surface={surface} />,
    description: draft.mode === "chase" ? null : counted.description,
    tone: undefined,
  };
}

function AnonymousSwitch({ editor }: { editor: HollerEditorState }) {
  return (
    <Field orientation="horizontal" className="w-auto gap-2.5">
      <FieldLabel className="font-normal text-ink-2 text-sm">Anonymous</FieldLabel>
      <Switch
        size="sm"
        checked={editor.draft.anonymous}
        onCheckedChange={(anonymous) => editor.update({ anonymous })}
      />
    </Field>
  );
}

function AnonymousNotice({ editor }: { editor: HollerEditorState }) {
  const warning = anonymousWarning(editor.draft.anonymous, editor.summary.reach);
  if (!warning) return null;
  return (
    <p
      role="status"
      className="flex items-start gap-2.5 rounded-b-plate bg-waiting px-4 py-3 text-sm text-waiting-ink"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {warning}
    </p>
  );
}

function SendActions({
  editor,
  onAsk,
}: {
  editor: HollerEditorState;
  onAsk: (kind: SendKind) => void;
}) {
  if (editor.scheduled) {
    return (
      <SendSplit
        pending={editor.sending}
        onClick={() => void editor.autosave.flush().catch(() => {})}
        options={[
          {
            label: "Change the time",
            icon: <CalendarClock aria-hidden />,
            onSelect: () => onAsk("schedule"),
          },
          { label: "Send now instead", icon: <Send aria-hidden />, onSelect: () => onAsk("now") },
        ]}
      >
        Update schedule
      </SendSplit>
    );
  }
  return (
    <SendSplit
      onClick={() => onAsk("now")}
      options={[
        {
          label: "Schedule…",
          icon: <CalendarClock aria-hidden />,
          onSelect: () => onAsk("schedule"),
        },
      ]}
    >
      Send
    </SendSplit>
  );
}

function HollerEditor({
  io,
  initial,
  saved = null,
  sender,
  workspaceSize,
  known,
  tagSuggestions = [],
  onCreated,
  onSent,
  onDeleted,
  backLink,
  now: fixedNow,
  timeZone,
}: Props) {
  const editor = useHollerEditor({
    io,
    initial,
    saved,
    onCreated,
    onSent,
    onDeleted,
    now: fixedNow,
    timeZone,
  });
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [asking, setAsking] = useState<SendKind | null>(null);
  const [kind, setKind] = useState<SendKind>("now");
  const { draft, holler, scheduled, autosave, sendShown } = editor;
  const shown = bar(editor);
  const context = { now: editor.now, senderZone: editor.senderZone, zones: editor.summary.zones };

  const ask = (next: SendKind) => {
    setKind(next);
    setAsking(next);
  };

  return (
    <div data-slot="holler-editor" className="-mb-12 flex flex-1 flex-col gap-3">
      <HollerEditorTop
        back={backLink}
        heading={
          <ModePicker
            mode={draft.mode}
            onChange={editor.changeMode}
            questionCount={draft.questions.length}
          />
        }
        saveState={scheduled && autosave.dirty ? "idle" : autosave.state}
        onTags={() => setTagsOpen(true)}
        onDelete={holler?.status === "draft" ? editor.remove : undefined}
        deleting={editor.deleting}
      />

      <div className="flex flex-1 flex-col gap-7">
        {scheduled && (
          <Notice
            icon={<CalendarClock />}
            title={draft.sendAt ? `Sends ${dayTime(draft.sendAt)}` : "Scheduled to send"}
            description="Edits wait until you press Update schedule, so a half-finished change never goes out."
          />
        )}

        <AudiencePicker
          value={draft.audience}
          onValueChange={(audience) => editor.update({ audience })}
          problem={problemFor(sendShown, "audience")}
          known={known}
          workspaceSize={workspaceSize}
          onSummaryChange={editor.setSummary}
          search={io.search}
          countPeople={io.countPeople}
          aside={<AnonymousSwitch editor={editor} />}
          notice={<AnonymousNotice editor={editor} />}
        />

        <HollerEditorWrite
          draft={draft}
          title={editor.title}
          problems={editor.composeShown}
          onUpdate={editor.update}
          onModeChange={editor.changeMode}
          onTemplates={() => setTemplatesOpen(true)}
        />

        <SendBar
          description={shown.description}
          tone={shown.tone}
          secondary={
            <SlackPreview
              holler={{
                mode: draft.mode,
                title: editor.title || "Untitled",
                description: draft.description,
                anonymous: draft.anonymous,
                questions: draft.questions.map(filled),
              }}
              sender={sender}
              closesAt={editor.closesAt}
              sendsAt={draft.sendAt}
              variant="ghost"
            >
              <Eye aria-hidden />
              <span className="max-sm:sr-only">Preview</span>
            </SlackPreview>
          }
          action={<SendActions editor={editor} onAsk={ask} />}
        >
          {shown.title}
        </SendBar>
      </div>

      <SendDialog
        open={asking !== null}
        onOpenChange={(open) => setAsking(open ? kind : null)}
        kind={kind}
        rescheduling={scheduled && kind === "schedule"}
        title={editor.title || "Untitled"}
        value={draft}
        pending={editor.sending}
        problems={{
          sendAt: problemFor(sendShown, "sendAt"),
          closesAt: problemFor(sendShown, "closesAt") ?? problemFor(sendShown, "closeAfterHours"),
          failed: editor.sendError ?? undefined,
          limit: editor.limit ?? undefined,
        }}
        reach={editor.summary.reach}
        context={context}
        knownChannels={known?.groups?.filter((g) => g.kind === "channel")}
        search={io.search ?? searchDirectory}
        onConfirm={(fields) => {
          void editor.send(fields).then(({ outcome, problems }) => {
            if (outcome === "failed") return;
            if (problems.some((p) => dialogFields.has(p.field ?? ""))) return;
            setAsking(null);
          });
        }}
      />

      <HollerEditorTags
        open={tagsOpen}
        onOpenChange={setTagsOpen}
        tags={draft.tags}
        suggestions={tagSuggestions}
        onTags={(tags) => editor.update({ tags })}
      />

      <TemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onUse={(template) => {
          setTemplatesOpen(false);
          editor.pickTemplate(template);
        }}
      />
    </div>
  );
}

export { HollerEditor };
