import { type Mode, modeDescriptions, modeLabels, modes, questionLimits } from "@holler/core";
import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { modeIcons } from "@/components/mode-glyph";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

interface Props extends Omit<ComponentProps<"button">, "onChange"> {
  mode: Mode;
  onChange: (mode: Mode) => void;
  questionCount: number;
}

function ModePicker({ mode, onChange, questionCount, className, ...props }: Props) {
  const Icon = modeIcons[mode];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        {...props}
        data-slot="mode-picker"
        className={cn(
          "relative inline-flex h-8 items-center gap-2 rounded-control ps-1 pe-2 text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus hoverable:hover:bg-hover data-popup-open:bg-hover pointer-coarse:before:absolute pointer-coarse:before:-inset-y-1.5 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']",
          className,
        )}
      >
        <span className="grid size-6 place-items-center rounded-glyph bg-tint text-tint-ink">
          <Icon aria-hidden size={14} strokeWidth={2} />
        </span>
        <span className="sr-only">Mode: </span>
        {modeLabels[mode]}
        <ChevronDown aria-hidden size={16} strokeWidth={2} className="text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label="What you are sending" align="start" className="w-[24rem]">
        <DropdownMenuRadioGroup value={mode} onValueChange={(next) => onChange(next as Mode)}>
          {modes.map((option) => {
            const OptionIcon = modeIcons[option];
            const tooMany = questionCount > questionLimits[option].max && option === "pulse";
            return (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                disabled={tooMany}
                className="items-start py-2.5"
              >
                <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5">
                  <OptionIcon
                    aria-hidden
                    size={16}
                    strokeWidth={2}
                    className={cn("mt-1", option === mode ? "text-tint-ink" : "text-muted")}
                  />
                  <span className="font-normal text-ink">{modeLabels[option]}</span>
                  <span className="col-start-2 whitespace-normal text-muted text-sm">
                    {tooMany
                      ? "A pulse has one or two questions. Remove some to switch."
                      : modeDescriptions[option]}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ModePicker };
