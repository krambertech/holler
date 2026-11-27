import type { HollerOut } from "@holler/core";
import { CalendarClock, Eye } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import type { EditorDraft } from "./draft";
import { HollerEditorSend } from "./holler-editor-send";
import { HollerEditorBack, HollerEditorTop } from "./holler-editor-top";
import { HollerEditorWrite } from "./holler-editor-write";
import { filled } from "./questions/model";
import type { DirectoryGroup, DirectoryPerson } from "./send/directory";
import { SendBar, SendButton } from "./send/send-bar";
import { composeBarSummary, dayTime, sendActionLabel, sendBarSummary } from "./send/send-logic";
import { SlackPreview } from "./send/slack-preview";
import { TemplatesDialog } from "./templates-dialog";
import {
  type EditorIo,
  type EditorStage,
  type HollerEditorState,
  useHollerEditor,
} from "./use-holler-editor";

export type { EditorIo, EditorStage };

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
  timeZone?: string | null | undefined;
}

function composeBar(editor: HollerEditorState) {
  const { draft, composeShown, surface } = editor;
  const problem = composeShown[0]?.message;
  const bar = composeBarSummary(surface, draft.questions.length, problem);
  const more = problem && composeShown.length > 1 ? `${composeShown.length - 1} more to fix` : null;
  return {
    title: bar.title,
    description: draft.mode === "chase" ? null : (bar.description ?? more),
    tone: bar.tone,
  };
}

function sendBar(editor: HollerEditorState) {
  const { draft, summary, now, senderZone, sendError, sendShown, composeShown } = editor;
  const problem = sendError ?? sendShown[0]?.message ?? composeShown[0]?.message;
  if (problem) return { title: problem, description: null, tone: "danger" as const };
  const bar = sendBarSummary(summary.reach, draft, { now, senderZone, zones: summary.zones });
  return { title: bar.title, description: bar.description, tone: undefined };
}

function SendAction({ editor }: { editor: HollerEditorState }) {
  const { draft, summary, title, scheduled, autosave, sending } = editor;
  if (scheduled && draft.sendAt) {
    return (
      <Button variant="primary" onClick={() => autosave.flush().catch(() => {})}>
        Update schedule
      </Button>
    );
  }
  return (
    <SendButton
      pending={sending}
      onSend={() => void editor.send()}
      send={{
        title: title || "Untitled",
        reach: summary.reach,
        chosen: summary.chosen,
        when: draft.sendAt ? dayTime(draft.sendAt) : "now",
        scheduled: Boolean(draft.sendAt),
      }}
    >
      {sendActionLabel(summary.reach, Boolean(draft.sendAt))}
    </SendButton>
  );
}

function HollerEditor({
  io,
  initial,
  saved = null,
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
  timeZone,
}: Props) {
  const editor = useHollerEditor({
    io,
    initial,
    saved,
    onStageChange,
    onCreated,
    onSent,
    onDeleted,
    now: fixedNow,
    timeZone,
  });
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const { draft, holler, scheduled, autosave } = editor;
  const writing = stage === "compose";
  const bar = writing ? composeBar(editor) : sendBar(editor);

  return (
    <div data-slot="holler-editor" className="flex flex-col gap-7">
      <HollerEditorTop
        back={
          writing ? (
            backLink
          ) : (
            <HollerEditorBack onClick={() => editor.goTo("compose")}>
              {draft.mode === "chase" ? "Back to the form" : "Back to questions"}
            </HollerEditorBack>
          )
        }
        saveState={scheduled && autosave.dirty ? "idle" : autosave.state}
        onDelete={holler?.status === "draft" ? editor.remove : undefined}
        deleting={editor.deleting}
      />

      {scheduled && (
        <Notice
          icon={<CalendarClock />}
          title={draft.sendAt ? `Sends ${dayTime(draft.sendAt)}` : "Scheduled to send"}
          description="Edits wait until you press Update schedule, so a half-finished change never goes out."
        />
      )}

      {writing ? (
        <HollerEditorWrite
          draft={draft}
          title={editor.title}
          problems={editor.composeShown}
          aside={editor.aside}
          onUpdate={editor.update}
          onModeChange={editor.changeMode}
          onTemplates={() => setTemplatesOpen(true)}
        />
      ) : (
        <HollerEditorSend
          draft={draft}
          title={editor.title}
          problems={editor.sendShown}
          onUpdate={editor.update}
          summary={editor.summary}
          onSummaryChange={editor.setSummary}
          known={known}
          workspaceSize={workspaceSize}
          tagSuggestions={tagSuggestions}
          search={io.search}
          limit={editor.limit}
          now={editor.now}
          timeZone={editor.senderZone}
        />
      )}

      <SendBar
        description={bar.description}
        tone={bar.tone}
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
        action={
          writing ? (
            <Button variant="primary" onClick={() => editor.goTo("send")}>
              Next: who and when
            </Button>
          ) : (
            <SendAction editor={editor} />
          )
        }
      >
        {bar.title}
      </SendBar>

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
