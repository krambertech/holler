import type { AnswerSurface } from "@holler/core";
import { CircleHelp, ExternalLink, Globe } from "lucide-react";
import type { ComponentProps } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { webReason } from "./send-logic";

interface Props extends ComponentProps<"span"> {
  surface: AnswerSurface;
}

function SlackMark({ className }: { className?: string | undefined }) {
  return (
    <svg aria-hidden viewBox="0 0 127 127" className={cn("size-4 shrink-0", className)}>
      <path
        className="fill-slack-red"
        d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z"
      />
      <path
        className="fill-slack-blue"
        d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z"
      />
      <path
        className="fill-slack-green"
        d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z"
      />
      <path
        className="fill-slack-yellow"
        d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z"
      />
    </svg>
  );
}

const shown = {
  dm: { icon: SlackMark, label: "Slack DM" },
  slack: { icon: SlackMark, label: "Slack form" },
  web: { icon: Globe, label: "Web page" },
  chase: { icon: ExternalLink, label: "Your form" },
} as const;

function why(surface: AnswerSurface): string {
  switch (surface.where) {
    case "dm":
      return "One quick question goes right in the DM, so people answer it there with a tap or a line of text.";
    case "slack":
      return "People press Answer in the DM and a form opens inside Slack.";
    case "web":
      return `${webReason(surface) ?? ""} People open a web page from the DM to answer.`.trim();
    case "chase":
      return "People open your link from the DM, fill in your form, then press I submitted it in Slack.";
  }
}

function SendBarAnsweredIn({ surface, className, ...props }: Props) {
  const { icon: Icon, label } = shown[surface.where];
  return (
    <span
      data-slot="send-bar-answered-in"
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    >
      <Icon className="size-4 shrink-0 text-muted" />
      <span>
        <span className="sr-only">Answered in a </span>
        {label}
      </span>
      <Popover>
        <PopoverTrigger
          openOnHover
          delay={150}
          aria-label="Why people answer here"
          className="relative -my-1 -ms-0.5 grid size-6 place-items-center rounded-full text-muted outline-none transition-colors hoverable:hover:text-ink focus-visible:ring-2 focus-visible:ring-focus pointer-coarse:before:absolute pointer-coarse:before:-inset-2.5 pointer-coarse:before:content-['']"
        >
          <CircleHelp aria-hidden className="size-4" strokeWidth={2} />
        </PopoverTrigger>
        <PopoverContent>{why(surface)}</PopoverContent>
      </Popover>
    </span>
  );
}

export { SendBarAnsweredIn };
