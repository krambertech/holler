import type { Mode } from "@holler/core";
import { CircleAlert } from "lucide-react";
import type { ComponentProps } from "react";
import { Notice } from "@/components/notice";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { questionsLabel } from "@/lib/format";
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

type Problem = { message: string; field: string | null };

interface Props extends ComponentProps<"div"> {
  draft: EditorDraft;
  title: string;
  problems: Problem[];
  aside: EditorDraft["questions"];
  onUpdate: (patch: Partial<EditorDraft>) => void;
  onModeChange: (mode: Mode) => void;
  onTemplates: () => void;
}

function ChaseForm({
  draft,
  aside,
  linkProblem,
  onUpdate,
}: {
  draft: EditorDraft;
  aside: EditorDraft["questions"];
  linkProblem: string | undefined;
  onUpdate: Props["onUpdate"];
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field invalid={Boolean(linkProblem)}>
        <FieldLabel>Link to the form</FieldLabel>
        <Input
          type="url"
          inputMode="url"
          value={draft.externalUrl ?? ""}
          onChange={(e) => onUpdate({ externalUrl: e.target.value })}
          placeholder="https://forms.gle/…"
        />
        <FieldError>{linkProblem}</FieldError>
      </Field>
      <p className="max-w-[60ch] text-muted text-sm">
        People get the link and an I submitted it button. Holler reminds everyone who has not
        pressed it until it closes.
      </p>
      {aside.length > 0 && (
        <Notice
          icon={<CircleAlert />}
          title={`Your ${questionsLabel(aside.length).toLocaleLowerCase()} are set aside`}
          description="A chase has no questions. Switch back to a pulse or a survey on this page to keep them."
        />
      )}
    </div>
  );
}

function HollerEditorWrite({
  draft,
  title,
  problems,
  aside,
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
          {draft.mode === "pulse" ? (
            <p aria-hidden className="text-4xl text-ink tracking-title">
              {title || "New pulse"}
            </p>
          ) : (
            <Field invalid={Boolean(titleProblem)}>
              <FieldLabel className="sr-only">Title</FieldLabel>
              <input
                value={draft.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                placeholder={
                  draft.mode === "chase" ? "What should people fill in?" : "Give it a title"
                }
                maxLength={150}
                className={bareTitle}
              />
              <FieldError>{titleProblem}</FieldError>
            </Field>
          )}
          <textarea
            aria-label="Intro"
            value={draft.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Add a line of context (optional)"
            rows={1}
            maxLength={4000}
            className={bareIntro}
          />
        </div>
      </header>

      {draft.mode === "chase" ? (
        <ChaseForm
          draft={draft}
          aside={aside}
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
