import {
  answerSurface,
  type Mode,
  modeLabels,
  type QuestionStyle,
  type QuestionType,
  slackLimits,
} from "@holler/core";
import { Check, ChevronDown, ExternalLink, Lock, X } from "lucide-react";
import type { ReactNode } from "react";
import { Mark } from "@/components/logo";
import { cn } from "@/lib/cn";
import { questionsLabel } from "@/lib/format";

export interface PreviewQuestion {
  type: QuestionType;
  style: QuestionStyle;
  prompt: string;
  description?: string | undefined;
  options: readonly { label: string }[];
  allowOther?: boolean | undefined;
  maxChoices?: number | null | undefined;
  followUp?: { prompt: string; onlyAfter: readonly number[] | null } | null | undefined;
  lowLabel?: string | null | undefined;
  highLabel?: string | null | undefined;
}

export interface PreviewHoller {
  mode: Mode;
  title: string;
  description?: string | undefined;
  anonymous: boolean;
  questions: readonly PreviewQuestion[];
}

const slackFont = "[font-family:ui-sans-serif,system-ui,-apple-system,'Segoe_UI',sans-serif]";

function SlackButton({
  children,
  picked = false,
  link = false,
}: {
  children: ReactNode;
  picked?: boolean | undefined;
  link?: boolean | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-xs px-3 font-semibold text-sm",
        picked ? "bg-answered text-answered-ink" : "bg-plate text-ink edge-2",
      )}
    >
      {picked && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}
      {children}
      {link && <ExternalLink className="size-3.5 text-muted" aria-hidden />}
    </span>
  );
}

function SlackBox({ children, tall = false }: { children: ReactNode; tall?: boolean | undefined }) {
  return (
    <span
      className={cn(
        "block rounded-xs bg-plate px-2.5 py-2 text-muted text-sm edge-2",
        tall && "min-h-16",
      )}
    >
      {children}
    </span>
  );
}

function SlackMessage({ time, children }: { time: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <Mark size={36} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-semibold text-ink">Holler</span>
          <span className="rounded-xs bg-well px-1 font-semibold text-[0.625rem] text-muted uppercase">
            App
          </span>
          <span className="text-muted text-xs tabular">{time}</span>
        </p>
        {children}
      </div>
    </div>
  );
}

function SlackPreviewFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure
      aria-label={label}
      className={cn(
        "grid gap-4 rounded-md bg-plate p-4 text-ink text-sm leading-relaxed edge",
        slackFont,
      )}
    >
      {children}
    </figure>
  );
}

function contextLine(holler: PreviewHoller, closes: string) {
  const parts = [modeLabels[holler.mode]];
  if (holler.mode !== "chase") parts.push(questionsLabel(holler.questions.length));
  parts.push(`Closes ${closes}`);
  if (holler.anonymous) parts.push("Anonymous");
  return parts.join(" · ");
}

function Context({ children }: { children: ReactNode }) {
  return <p className="text-muted text-xs">{children}</p>;
}

function FormQuestion({ q, index }: { q: PreviewQuestion; index: number }) {
  const prompt = q.prompt.trim() || `Question ${index + 1}`;
  const options = [
    ...q.options.map((o) => o.label || "Option"),
    ...(q.allowOther ? ["Other"] : []),
  ];
  let control: ReactNode;
  if (q.type === "text") control = <SlackBox tall>Write your answer</SlackBox>;
  else if (q.type === "number") control = <SlackBox>A number</SlackBox>;
  else if (q.type === "person") {
    control = (
      <SlackBox>
        <span className="flex items-center justify-between">
          {q.maxChoices === 1 ? "Pick a person" : "Pick people"}
          <ChevronDown className="size-4" aria-hidden />
        </span>
      </SlackBox>
    );
  } else if (options.length > slackLimits.inlineOptions) {
    control = (
      <SlackBox>
        <span className="flex items-center justify-between">
          Pick an option
          <ChevronDown className="size-4" aria-hidden />
        </span>
      </SlackBox>
    );
  } else {
    const round = q.type === "single";
    control = (
      <span className="grid gap-1.5">
        {options.map((label, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- a preview of words that can repeat, redrawn whole on every change
          <span key={`${i}-${label}`} className="flex items-center gap-2 text-ink">
            <span
              aria-hidden
              className={cn(
                "size-4 shrink-0 bg-plate edge-3",
                round ? "rounded-full" : "rounded-xs",
              )}
            />
            {label}
            {q.style === "scale" && i === 0 && q.lowLabel && (
              <span className="text-muted">{q.lowLabel}</span>
            )}
            {q.style === "scale" && i === options.length - 1 && q.highLabel && (
              <span className="text-muted">{q.highLabel}</span>
            )}
          </span>
        ))}
      </span>
    );
  }
  return (
    <div className="grid gap-1.5">
      <p className="font-semibold">
        {prompt}
        {q.type === "multi" && q.maxChoices && (
          <span className="font-normal text-muted"> Pick up to {q.maxChoices}</span>
        )}
      </p>
      {q.description && <p className="text-muted text-xs">{q.description}</p>}
      {control}
      {q.allowOther && q.type !== "text" && q.type !== "number" && q.type !== "person" && (
        <>
          <p className="font-semibold">If Other, what?</p>
          <SlackBox>Optional</SlackBox>
        </>
      )}
      {q.followUp && !q.followUp.onlyAfter && (
        <>
          <p className="font-semibold">{q.followUp.prompt || "Anything to add?"}</p>
          <SlackBox tall>Optional</SlackBox>
        </>
      )}
    </div>
  );
}

function AnswerControls({ holler, label }: { holler: PreviewHoller; label: string }) {
  const surface = answerSurface(holler);
  const only = holler.questions[0];
  if (surface.where === "dm" && only?.type === "text") {
    return (
      <span className="grid gap-1.5">
        <SlackBox>Write your answer</SlackBox>
        <span>
          <SlackButton>Send</SlackButton>
        </span>
      </span>
    );
  }
  if (surface.where === "dm" && only) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {only.options.map((o, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- a preview of words that can repeat, redrawn whole on every change
          <SlackButton key={`${i}-${o.label}`}>{o.label || "Option"}</SlackButton>
        ))}
      </span>
    );
  }
  if (surface.where === "chase") {
    return (
      <span className="flex flex-wrap gap-1.5">
        <SlackButton link>Open the form</SlackButton>
        <SlackButton>I submitted it</SlackButton>
      </span>
    );
  }
  return (
    <span>
      <SlackButton link={surface.where === "web"}>{label}</SlackButton>
    </span>
  );
}

function SlackPreviewInvite({
  holler,
  sender,
  title,
  closes,
  time,
}: {
  holler: PreviewHoller;
  sender: string;
  title: string;
  closes: string;
  time: string;
}) {
  const surface = answerSurface(holler);
  const only = holler.questions[0];
  const question = surface.where === "dm" ? only?.prompt.trim() : null;
  return (
    <SlackMessage time={time}>
      <p>
        <span className="font-semibold">{sender}</span> sent you a Holler.
      </p>
      <p className="font-semibold">{title}</p>
      {question && question !== title && <p>{question}</p>}
      {holler.description && <p className="whitespace-pre-line text-ink-2">{holler.description}</p>}
      {surface.where === "dm" && only?.description && (
        <p className="text-muted text-xs">{only.description}</p>
      )}
      <AnswerControls holler={holler} label="Answer" />
      <Context>{contextLine(holler, closes)}</Context>
    </SlackMessage>
  );
}

function SlackPreviewAfterTap({
  holler,
  title,
  time,
}: {
  holler: PreviewHoller;
  title: string;
  time: string;
}) {
  const surface = answerSurface(holler);
  const only = holler.questions[0];
  if (surface.where === "dm" && only) {
    const pick = only.followUp?.onlyAfter?.[0] ?? 0;
    const given = only.type === "text" ? "What you wrote" : only.options[pick]?.label || "Option";
    const note =
      only.type !== "text" &&
      only.followUp &&
      (only.followUp.onlyAfter === null || only.followUp.onlyAfter.includes(pick))
        ? only.followUp
        : null;
    return (
      <SlackMessage time={time}>
        <p>
          Thanks. Your answer to <span className="italic">{title}</span> is in.
        </p>
        {holler.anonymous ? (
          <Context>Answered anonymously</Context>
        ) : (
          <Context>
            <span className="block font-semibold">{only.prompt.trim() || title}</span>
            <span className="block">{given}</span>
          </Context>
        )}
        {note && (
          <>
            <p className="font-semibold">{note.prompt.trim() || "Anything to add?"}</p>
            <SlackBox>Optional. Press Enter to send.</SlackBox>
          </>
        )}
      </SlackMessage>
    );
  }
  if (surface.where === "chase") {
    return (
      <SlackMessage time={time}>
        <p>
          Thanks. You marked <span className="italic">{title}</span> as submitted.
        </p>
      </SlackMessage>
    );
  }
  if (surface.where === "web") {
    return (
      <div className="grid overflow-hidden rounded-md bg-canvas edge">
        <div className="flex items-center gap-2 border-edge border-b bg-plate px-3 py-2 text-muted text-xs">
          <Lock className="size-3.5" aria-hidden />
          <span className="truncate">app.holler.team/respond</span>
        </div>
        <div className="grid gap-4 p-4">
          <p className="text-lg">{title}</p>
          {holler.description && (
            <p className="whitespace-pre-line text-ink-2 text-sm">{holler.description}</p>
          )}
          <div className="grid gap-4 text-sm">
            {holler.questions.slice(0, 3).map((q, i) => (
              // oxlint-disable-next-line react/no-array-index-key -- a preview of words that can repeat, redrawn whole on every change
              <FormQuestion key={`${i}-${q.prompt}`} q={q} index={i} />
            ))}
            {holler.questions.length > 3 && (
              <p className="text-muted">
                {holler.questions.length === 4
                  ? "And 1 more question."
                  : `And ${holler.questions.length - 3} more questions.`}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "mx-auto grid w-full max-w-md overflow-hidden rounded-md bg-plate text-ink text-sm edge",
        slackFont,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-edge border-b px-4 py-3">
        <p className="truncate font-semibold text-base">{title}</p>
        <X className="size-4 shrink-0 text-muted" aria-hidden />
      </div>
      <div className="grid gap-4 px-4 py-4">
        {holler.description && (
          <p className="whitespace-pre-line text-ink-2">{holler.description}</p>
        )}
        {holler.questions.map((q, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- a preview of words that can repeat, redrawn whole on every change
          <FormQuestion key={`${i}-${q.prompt}`} q={q} index={i} />
        ))}
      </div>
      <div className="flex justify-end gap-2 border-edge border-t px-4 py-3">
        <SlackButton>Cancel</SlackButton>
        <SlackButton>Submit</SlackButton>
      </div>
    </div>
  );
}

function SlackPreviewReminder({
  holler,
  sender,
  title,
  closes,
  time,
}: {
  holler: PreviewHoller;
  sender: string;
  title: string;
  closes: string;
  time: string;
}) {
  const surface = answerSurface(holler);
  const only = holler.questions[0];
  const question = surface.where === "dm" && only?.type !== "text" ? only?.prompt.trim() : null;
  return (
    <SlackMessage time={time}>
      <p>
        A reminder: <span className="font-semibold">{sender}</span> still needs your answer to{" "}
        <span className="italic">{title}</span>
      </p>
      {question && question !== title && <p className="font-semibold">{question}</p>}
      <AnswerControls holler={holler} label="Answer now" />
      <span>
        <SlackButton>Remind me later</SlackButton>
      </span>
      <Context>{contextLine(holler, closes)}</Context>
    </SlackMessage>
  );
}

export { SlackPreviewAfterTap, SlackPreviewFrame, SlackPreviewInvite, SlackPreviewReminder };
