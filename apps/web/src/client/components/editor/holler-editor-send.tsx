import type { ComponentProps } from "react";
import { LimitReached } from "@/components/billing/limit-reached";
import { cn } from "@/lib/cn";
import { type EditorDraft, problemFor } from "./draft";
import { AudiencePicker, type AudienceSummary } from "./send/audience-picker";
import type { DirectoryGroup, DirectoryPerson, DirectorySearch } from "./send/directory";
import { SendSettings } from "./send/send-settings";

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
      <SendSettings
        value={draft}
        onValueChange={(fields) => onUpdate(fields)}
        problems={{
          sendAt: problemFor(problems, "sendAt"),
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
