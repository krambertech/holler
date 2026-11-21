import {
  type HollerTemplate,
  hollerTemplates,
  modeLabels,
  type QuestionInput,
  type TemplateGroup,
  templateFor,
  templateGroups,
} from "@holler/core";
import { useId, useState } from "react";
import { modeIcons } from "@/components/mode-glyph";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { questionsLabel } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (template: HollerTemplate) => void;
  initial?: string | undefined;
  useLabel?: string | undefined;
}

function questionLine(q: QuestionInput): string {
  const filled = {
    type: q.type,
    style: q.style ?? "plain",
    options: q.options ?? [],
    lowLabel: q.lowLabel ?? null,
    highLabel: q.highLabel ?? null,
  };
  return templateFor(filled).label;
}

function answersLine(q: QuestionInput): string | null {
  const labels = (q.options ?? []).map((o) => o.label).filter(Boolean);
  if (labels.length > 0) {
    const shown = labels.length > 5 ? `${labels[0]} to ${labels.at(-1)}` : labels.join(", ");
    return q.lowLabel || q.highLabel
      ? `${shown} · ${q.lowLabel ?? ""} to ${q.highLabel ?? ""}`
      : shown;
  }
  if ((q.options ?? []).length > 0) return "You write the options";
  return null;
}

function TemplatePreview({ template }: { template: HollerTemplate }) {
  const Icon = modeIcons[template.mode];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-muted text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-tint px-2.5 py-0.5 text-tint-ink">
          <Icon aria-hidden size={13} strokeWidth={2} />
          {modeLabels[template.mode]}
        </span>
        {template.mode !== "chase" && <span>{questionsLabel(template.questions.length)}</span>}
        {template.anonymous && <span>Anonymous</span>}
      </div>
      {template.title && <p className="text-lg">{template.title}</p>}
      {template.description && <p className="text-ink-2">{template.description}</p>}
      {template.mode === "chase" ? (
        <p className="text-muted text-sm">
          Add the link to your form. People get it with an I submitted it button, and Holler reminds
          everyone else until it closes.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {template.questions.map((q, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- a template is fixed, never reordered
            <li key={index} className="flex gap-3 rounded-control bg-plate px-3.5 py-3 edge">
              <span className="mt-0.5 text-muted text-sm tabular">{index + 1}</span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-muted text-sm">{questionLine(q)}</span>
                <span className="font-normal">{q.prompt}</span>
                {answersLine(q) && <span className="text-muted text-sm">{answersLine(q)}</span>}
                {q.followUp && (
                  <span className="text-muted text-sm">Then: {q.followUp.prompt}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TemplatesDialog({
  open,
  onOpenChange,
  onUse,
  initial,
  useLabel = "Use this template",
}: Props) {
  const first = hollerTemplates.find((t) => t.id === initial) ?? hollerTemplates[0];
  const [chosenId, setChosenId] = useState(first?.id);
  const [group, setGroup] = useState<TemplateGroup>(first?.group ?? "check-ins");
  const chosen = hollerTemplates.find((t) => t.id === chosenId) ?? first;
  const listId = useId();
  const inGroup = hollerTemplates.filter((t) => t.group === group);

  const pickGroup = (next: TemplateGroup) => {
    setGroup(next);
    const top = hollerTemplates.find((t) => t.group === next);
    if (top) setChosenId(top.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="gap-0 p-0">
        <DialogHeader className="border-divider border-b px-5 pt-5 pb-4">
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            It fills in the questions. You can change anything before you send it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 md:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1.15fr)]">
          <div
            role="tablist"
            aria-label="What it is for"
            className="flex gap-1 overflow-x-auto border-divider border-b px-4 py-3 md:flex-col md:border-e md:border-b-0 md:px-3"
          >
            {templateGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={g.id === group}
                aria-controls={listId}
                onClick={() => pickGroup(g.id)}
                className={cn(
                  "shrink-0 rounded-control px-3 py-2 text-start text-sm transition-colors hoverable:hover:bg-hover md:text-base",
                  g.id === group ? "bg-tint text-tint-ink" : "text-ink-2",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          <ul
            id={listId}
            aria-label="Templates"
            className="flex flex-col py-2 md:border-divider md:border-e"
          >
            {inGroup.map((t) => {
              const Icon = modeIcons[t.mode];
              const selected = t.id === chosen?.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setChosenId(t.id)}
                    onDoubleClick={() => onUse(t)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-2.5 text-start transition-colors hoverable:hover:bg-hover",
                      selected && "bg-hover",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-glyph",
                        selected ? "bg-tint text-tint-ink" : "bg-well text-muted",
                      )}
                    >
                      <Icon size={15} strokeWidth={2} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-normal">{t.name}</span>
                      <span className="text-muted text-sm">{t.summary}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {chosen && (
            <div className="flex flex-col gap-4 bg-canvas p-5">
              <TemplatePreview template={chosen} />
              <div className="mt-auto flex flex-wrap justify-end gap-2 pt-2">
                <DialogClose render={<Button variant="ghost">Cancel</Button>} />
                <Button variant="primary" onClick={() => onUse(chosen)}>
                  {useLabel}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { TemplatePreview, TemplatesDialog };
