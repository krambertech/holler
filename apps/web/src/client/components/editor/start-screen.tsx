import { hollerTemplates, type Mode, modeDescriptions, modeLabels, modes } from "@holler/core";
import { ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import { modeIcons } from "@/components/mode-glyph";
import { cn } from "@/lib/cn";

interface Props extends ComponentProps<"div"> {
  onPickMode: (mode: Mode) => void;
  onPickTemplate: (id: string) => void;
  onSeeAllTemplates: () => void;
}

const featured = ["weekly-pulse", "retro", "enps"];

const line = "block h-[5px] rounded-full bg-edge-3";

function Drawing({ mode }: { mode: Mode }) {
  return (
    <span
      aria-hidden
      className="flex w-full max-w-[12rem] flex-col gap-[7px] rounded-[10px] bg-plate p-2.5 edge"
    >
      <span className="flex items-center gap-1.5">
        <span className="size-3.5 shrink-0 rounded-[4px] bg-plum" />
        <span className={cn(line, "w-1/2")} />
      </span>
      {mode === "pulse" && (
        <>
          <span className={cn(line, "w-4/5 bg-ink-2 opacity-60")} />
          <span className="flex gap-1">
            <span className="h-4 flex-1 rounded-[4px] edge-2" />
            <span className="h-4 flex-1 rounded-[4px] bg-primary" />
            <span className="h-4 flex-1 rounded-[4px] edge-2" />
          </span>
        </>
      )}
      {mode === "survey" && (
        <>
          {[true, false].map((ticked) => (
            <span key={String(ticked)} className="flex items-center gap-1.5">
              <span
                className={cn("size-2.5 shrink-0 rounded-[3px]", ticked ? "bg-primary" : "edge-3")}
              />
              <span className={cn(line, ticked ? "w-4/5" : "w-3/5")} />
            </span>
          ))}
          <span className="h-3.5 rounded-[4px] edge-2" />
        </>
      )}
      {mode === "chase" && (
        <>
          <span className="block h-[5px] w-3/4 rounded-full bg-primary opacity-60" />
          <span className="self-start rounded-[4px] px-2 py-0.5 text-[10px] text-ink-2 leading-tight edge-2">
            I submitted it
          </span>
        </>
      )}
    </span>
  );
}

function StartScreen({
  onPickMode,
  onPickTemplate,
  onSeeAllTemplates,
  className,
  ...props
}: Props) {
  return (
    <div data-slot="start-screen" className={cn("flex flex-col gap-8", className)} {...props}>
      <h1 className="text-4xl tracking-title">What are you sending?</h1>
      <ul className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {modes.map((mode) => {
          const Icon = modeIcons[mode];
          return (
            <li key={mode} className="flex">
              <button
                type="button"
                onClick={() => onPickMode(mode)}
                className="group/mode flex w-full flex-row overflow-hidden rounded-plate bg-plate text-start outline-none edge transition-shadow focus-visible:ring-2 focus-visible:ring-focus hoverable:hover:ring-[1.5px] hoverable:hover:ring-primary sm:flex-col"
              >
                <span className="grid w-28 shrink-0 place-items-center bg-well p-2.5 transition-colors group-hover/mode:bg-tint sm:h-32 sm:w-auto sm:p-5">
                  <Drawing mode={mode} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3.5 sm:pt-3.5 sm:pb-4">
                  <span className="flex items-center gap-2 text-lg">
                    <span className="grid size-7 shrink-0 place-items-center rounded-glyph bg-tint text-tint-ink">
                      <Icon aria-hidden size={15} strokeWidth={2} />
                    </span>
                    {modeLabels[mode]}
                    <ChevronRight
                      aria-hidden
                      size={18}
                      strokeWidth={2}
                      className="ms-auto text-muted transition-transform group-hover/mode:translate-x-0.5 group-hover/mode:text-tint-ink motion-reduce:transition-none motion-reduce:group-hover/mode:translate-x-0"
                    />
                  </span>
                  <span className="text-muted text-sm">{modeDescriptions[mode]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="start-templates" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4 px-1">
          <h2 id="start-templates" className="text-lg">
            Or start from a template
          </h2>
          <button
            type="button"
            onClick={onSeeAllTemplates}
            className="rounded-sm text-sm text-tint-ink outline-none focus-visible:ring-2 focus-visible:ring-focus hoverable:hover:underline"
          >
            See all {hollerTemplates.length}
          </button>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {featured.map((id) => {
            const template = hollerTemplates.find((t) => t.id === id);
            if (!template) return null;
            const Icon = modeIcons[template.mode];
            return (
              <li key={id} className="flex">
                <button
                  type="button"
                  onClick={() => onPickTemplate(id)}
                  className="flex w-full flex-col gap-1.5 rounded-plate bg-plate px-4 py-3.5 text-start outline-none edge transition-shadow focus-visible:ring-2 focus-visible:ring-focus hoverable:hover:edge-3"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-normal">{template.name}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-tint px-2 py-px text-tint-ink text-xs">
                      <Icon aria-hidden size={11} strokeWidth={2} />
                      {modeLabels[template.mode]}
                    </span>
                  </span>
                  <span className="text-ink-2 text-sm">{template.summary}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export { StartScreen };
