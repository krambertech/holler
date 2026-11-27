import { hollerTitle } from "@holler/core";
import { type ComponentProps, useState } from "react";
import { LimitReached } from "@/components/billing/limit-reached";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { type EditorDraft, problemFor } from "./draft";
import { filled } from "./questions/model";
import { AudiencePicker, type AudienceSummary } from "./send/audience-picker";
import type { DirectoryGroup, DirectoryPerson, DirectorySearch } from "./send/directory";
import { SendSettings } from "./send/send-settings";
import { WhenPicker } from "./send/when-picker";

type Problem = { message: string; field: string | null };

interface Props extends ComponentProps<"div"> {
  draft: EditorDraft;
  title: string;
  problems: Problem[];
  onUpdate: (patch: Partial<EditorDraft>) => void;
  summary: AudienceSummary;
  onSummaryChange: (summary: AudienceSummary) => void;
  known?: { people?: DirectoryPerson[]; groups?: DirectoryGroup[] } | undefined;
  workspaceSize?: number | null | undefined;
  tagSuggestions?: string[] | undefined;
  search?: DirectorySearch | undefined;
  limit?: string | null | undefined;
  now: Date;
  timeZone: string;
}

function PulseTitle({ draft, title, onUpdate }: Pick<Props, "draft" | "title" | "onUpdate">) {
  const [custom, setCustom] = useState(Boolean(draft.title));
  if (custom) {
    return (
      <Input
        aria-label="Title"
        value={draft.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        placeholder={hollerTitle({ ...draft, title: "", questions: draft.questions.map(filled) })}
        maxLength={150}
        autoFocus
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setCustom(true)}
      className="w-fit rounded-sm text-sm text-tint-ink outline-none focus-visible:ring-2 focus-visible:ring-focus hoverable:hover:underline"
    >
      Use a different title
      <span className="sr-only">, instead of {title || "the first question"}</span>
    </button>
  );
}

function HollerEditorSend({
  draft,
  title,
  problems,
  onUpdate,
  summary,
  onSummaryChange,
  known,
  workspaceSize,
  tagSuggestions,
  search,
  limit,
  now,
  timeZone,
  className,
  ...props
}: Props) {
  return (
    <div data-slot="holler-editor-send" className={cn("flex flex-col gap-8", className)} {...props}>
      <header className="flex flex-col gap-2">
        <h1 className="text-pretty text-4xl tracking-title">Send “{title || "Untitled"}”</h1>
        {draft.mode === "pulse" && <PulseTitle draft={draft} title={title} onUpdate={onUpdate} />}
      </header>
      <AudiencePicker
        value={draft.audience}
        onValueChange={(audience) => onUpdate({ audience })}
        problem={problemFor(problems, "audience")}
        known={known}
        workspaceSize={workspaceSize}
        onSummaryChange={onSummaryChange}
        search={search}
      />
      <WhenPicker
        value={draft}
        onValueChange={(when) => onUpdate(when)}
        problem={problemFor(problems, "sendAt")}
        reach={summary.reach}
        zones={summary.zones}
        now={now}
        timeZone={timeZone}
      />
      <SendSettings
        value={draft}
        onValueChange={(fields) => onUpdate(fields)}
        problems={{
          closesAt: problemFor(problems, "closesAt") ?? problemFor(problems, "closeAfterHours"),
        }}
        reach={summary.reach}
        zones={summary.zones}
        tagSuggestions={tagSuggestions}
        knownChannels={known?.groups?.filter((g) => g.kind === "channel")}
        search={search}
        now={now}
        timeZone={timeZone}
      />
      {limit != null && <LimitReached fallbackMessage={limit} />}
    </div>
  );
}

export { HollerEditorSend };
