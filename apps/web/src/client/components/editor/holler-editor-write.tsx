import type { Mode } from "@holler/core";
import type { ComponentProps } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { type EditorDraft, problemFor, questionProblems } from "./draft";
import { ModePicker } from "./mode-picker";
import { QuestionList } from "./questions/question-list";

const pageHeading: Record<Mode, string> = {
  pulse: "Write a pulse",
  survey: "Write a survey",
  chase: "Write a chase",
};

const bareTitle =
  "w-full border-0 bg-transparent p-0 text-4xl tracking-title text-ink outline-none placeholder:text-muted";
const bareIntro =
  "w-full resize-none border-0 bg-transparent p-0 text-ink-2 outline-none placeholder:text-muted field-sizing-content";

function placeholderFor(mode: Mode, title: string): string {
  if (mode === "chase") return "What should people fill in?";
  if (mode === "pulse") return title || "Give it a title";
  return "Give it a title";
}

type Problem = { message: string; field: string | null };

interface Props extends ComponentProps<"div"> {
  draft: EditorDraft;
  title: string;
  problems: Problem[];
  onUpdate: (patch: Partial<EditorDraft>) => void;
  onModeChange: (mode: Mode) => void;
  onTemplates: () => void;
}

function ChaseForm({
  draft,
  linkProblem,
  onUpdate,
}: {
  draft: EditorDraft;
  linkProblem: string | undefined;
  onUpdate: Props["onUpdate"];
}) {
  return (
    <Field invalid={Boolean(linkProblem)}>
      <FieldLabel>Link</FieldLabel>
      <Input
        type="url"
        inputMode="url"
        value={draft.externalUrl ?? ""}
        onChange={(e) => onUpdate({ externalUrl: e.target.value })}
        placeholder="https://forms.gle/…"
      />
      <FieldDescription>Holler reminds people until they press I submitted it.</FieldDescription>
      <FieldError>{linkProblem}</FieldError>
    </Field>
  );
}

function HollerEditorWrite({
  draft,
  title,
  problems,
  onUpdate,
  onModeChange,
  onTemplates,
  className,
  ...props
}: Props) {
  const titleProblem = problemFor(problems, "title");
  return (
    <div
      data-slot="holler-editor-write"
      className={cn("flex flex-col gap-7", className)}
      {...props}
    >
      <header className="flex flex-col items-start gap-3">
        <h1 className="sr-only">{pageHeading[draft.mode]}</h1>
        <ModePicker
          mode={draft.mode}
          onChange={onModeChange}
          questionCount={draft.questions.length}
        />
        <div className="flex w-full flex-col gap-2">
          <Field invalid={Boolean(titleProblem)}>
            <FieldLabel className="sr-only">Title</FieldLabel>
            <input
              value={draft.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder={placeholderFor(draft.mode, title)}
              maxLength={150}
              className={bareTitle}
            />
            <FieldError>{titleProblem}</FieldError>
          </Field>
          <textarea
            aria-label="Intro"
            value={draft.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Add a description (optional)"
            rows={1}
            maxLength={4000}
            className={bareIntro}
          />
        </div>
      </header>

      {draft.mode === "chase" ? (
        <ChaseForm
          draft={draft}
          linkProblem={problemFor(problems, "externalUrl")}
          onUpdate={onUpdate}
        />
      ) : (
        <QuestionList
          mode={draft.mode}
          questions={draft.questions}
          onChange={(questions) => onUpdate({ questions })}
          problems={questionProblems(problems)}
          onTemplates={onTemplates}
          onMakeSurvey={() => onModeChange("survey")}
        />
      )}
    </div>
  );
}

export { HollerEditorWrite };
