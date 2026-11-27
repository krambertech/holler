import {
  type HollerDraftInput,
  type HollerOut,
  hollerDraftSchema,
  hollerTemplates,
  type Mode,
} from "@holler/core";
import { useState } from "react";
import { blankDraft, draftFromTemplate, type EditorDraft } from "@/components/editor/draft";
import {
  BackLabel,
  type EditorIo,
  type EditorStage,
  HollerEditor,
} from "@/components/editor/holler-editor";
import { ModePicker } from "@/components/editor/mode-picker";
import { StartScreen } from "@/components/editor/start-screen";
import { TemplatePreview, TemplatesDialog } from "@/components/editor/templates-dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { Variants } from "../frame";
import type { Group } from "./types";

const noop = () => {};

function fakeIo(): EditorIo {
  let n = 0;
  const id = `hol_design${String(++n).padStart(6, "0")}`;
  const at = new Date().toISOString();
  return {
    save: async (payload: HollerDraftInput) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const draft = hollerDraftSchema.parse(payload);
      const problems = [
        ...(draft.mode !== "pulse" && !draft.title.trim()
          ? [{ message: "Give it a title.", field: "title" }]
          : []),
        ...draft.questions.flatMap((q, i) =>
          q.prompt.trim()
            ? []
            : [{ message: "Write the question.", field: `questions.${i}.prompt` }],
        ),
        ...(draft.audience.everyone || draft.audience.people.length || draft.audience.groups.length
          ? []
          : [{ message: "Choose who to send it to.", field: "audience" }]),
      ];
      const out: HollerOut = {
        id,
        mode: draft.mode,
        status: "draft",
        title: draft.title,
        displayTitle: draft.title,
        description: draft.description,
        externalUrl: draft.externalUrl,
        anonymous: draft.anonymous,
        visibility: draft.visibility,
        tags: draft.tags,
        audience: draft.audience,
        announceChannelId: draft.announceChannelId,
        sendAt: draft.sendAt?.toISOString() ?? null,
        sendInRecipientTimeZone: draft.sendInRecipientTimeZone,
        closeAfterHours: draft.closeAfterHours,
        answeredIn: "slack",
        remindersEnabled: draft.remindersEnabled,
        repeat: draft.repeat,
        repeatOfId: null,
        sentAt: null,
        closesAt: draft.closesAt?.toISOString() ?? null,
        closedAt: null,
        createdVia: "web",
        createdAt: at,
        updatedAt: new Date().toISOString(),
        isCreator: true,
        problems,
        questions: draft.questions.map((q, i) => ({
          id: q.id ?? `question_${i}`,
          position: i,
          type: q.type,
          style: q.style,
          prompt: q.prompt,
          description: q.description,
          required: q.required,
          options: q.options.map((o, j) => ({
            id: o.id ?? `option_${i}_${j}`,
            position: j,
            label: o.label,
            score: o.score ?? null,
            isOther: false,
          })),
          allowOther: q.allowOther,
          maxChoices: q.maxChoices,
          followUp: q.followUp,
          lowLabel: q.lowLabel,
          highLabel: q.highLabel,
          numberMin: q.numberMin,
          numberMax: q.numberMax,
        })),
      };
      return out;
    },
    send: async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      throw new ApiError(
        503,
        "slack_unavailable",
        "Holler cannot reach Slack from here yet. Your Holler is saved; try again once Slack delivery is switched on.",
      );
    },
    remove: async () => {},
    search: async () => ({ people: [], groups: [] }),
  };
}

function EditorDemo({
  start,
  stage: first = "compose",
}: {
  start: EditorDraft;
  stage?: EditorStage;
}) {
  const [stage, setStage] = useState<EditorStage>(first);
  const [io] = useState(fakeIo);
  return (
    <div className="w-full max-w-[720px]">
      <HollerEditor
        io={io}
        initial={start}
        stage={stage}
        onStageChange={setStage}
        sender="Mira"
        workspaceSize={48}
        backLink={
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <BackLabel />
          </span>
        }
      />
    </div>
  );
}

function PickerDemo({ start, count }: { start: Mode; count: number }) {
  const [mode, setMode] = useState<Mode>(start);
  return (
    <h1 className="flex flex-wrap items-center gap-x-2.5 text-4xl tracking-title">
      New
      <ModePicker mode={mode} onChange={setMode} questionCount={count} />
    </h1>
  );
}

function TemplatesDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Start from a template</Button>
      <TemplatesDialog open={open} onOpenChange={setOpen} onUse={() => setOpen(false)} />
    </>
  );
}

const template = (id: string) => {
  const found = hollerTemplates.find((t) => t.id === id);
  if (!found) throw new Error(id);
  return found;
};

export const editor: Group = {
  slug: "editor",
  title: "Editor",
  lede: "Making a Holler: the start screen, the mode in the page's title, the templates, and the editor's two stages, Compose and Send, with the bar that names what the next press does.",
  entries: [
    {
      slug: "start-screen",
      name: "StartScreen",
      source: "components/editor/start-screen.tsx",
      note: "What New holler opens. Each mode is one card with a drawing of what people get; one click opens Compose in it. Three templates sit below, apart from the modes.",
      Demo: () => (
        <div className="w-full max-w-[800px]">
          <StartScreen onPickMode={noop} onPickTemplate={noop} onSeeAllTemplates={noop} />
        </div>
      ),
    },
    {
      slug: "mode-picker",
      name: "ModePicker",
      source: "components/editor/mode-picker.tsx",
      note: "The mode, named in the title: New survey. It opens the three modes with a line on each, and stays changeable until the Holler is sent. A pulse is offered only when the questions fit in one.",
      Demo: () => (
        <Variants
          stack
          items={[
            { label: "A survey", render: () => <PickerDemo start="survey" count={1} /> },
            {
              label: "Three questions: Pulse is not offered",
              render: () => <PickerDemo start="survey" count={3} />,
            },
            { label: "A chase", render: () => <PickerDemo start="chase" count={0} /> },
          ]}
        />
      ),
    },
    {
      slug: "templates-dialog",
      name: "TemplatesDialog, TemplatePreview",
      source: "components/editor/templates-dialog.tsx",
      note: "Every template, grouped by what it is for, with the chosen one's questions beside the list. On a phone the groups become a row above the list.",
      Demo: () => (
        <Variants
          items={[
            { label: "Closed", render: () => <TemplatesDemo /> },
            {
              label: "A preview on its own",
              render: () => (
                <div className="w-full max-w-[360px]">
                  <TemplatePreview template={template("enps")} />
                </div>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "holler-editor",
      name: "HollerEditor, BackLabel",
      source: "components/editor/holler-editor.tsx",
      note: "Compose and Send, both reachable at any time. It saves a moment after each change. Send shows every problem beside its field and moves to the stage that has one; here, Slack refuses the send, as it does until Slack delivery is switched on.",
      Demo: () => (
        <Variants
          stack
          items={[
            { label: "A new survey", render: () => <EditorDemo start={blankDraft("survey")} /> },
            {
              label: "From the weekly pulse template",
              render: () => <EditorDemo start={draftFromTemplate(template("weekly-pulse"))} />,
            },
            {
              label: "A chase",
              render: () => <EditorDemo start={draftFromTemplate(template("expense-report"))} />,
            },
            {
              label: "Send",
              render: () => (
                <EditorDemo start={draftFromTemplate(template("retro"))} stage="send" />
              ),
            },
          ]}
        />
      ),
    },
  ],
};
