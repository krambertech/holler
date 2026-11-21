import {
  answerSurface,
  hollerTitle,
  type Mode,
  modeLabels,
  type QuestionStyle,
  type QuestionType,
  slackLimits,
} from "@holler/core";
import { Check, ChevronDown, ExternalLink, Eye, Lock, X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Mark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { questionsLabel } from "@/lib/format";
import { useControllableState } from "@/lib/use-controllable-state";
import { answeredInLabel, clockTime, dayTime, webReason } from "./send-logic";

/** What the preview needs of a question. Any draft question fits. */
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

export type PreviewView = "dm" | "tap" | "reminder";

interface Props extends ComponentProps<"button"> {
  holler: PreviewHoller;
  /** Who sends it, as the DM names them. */
  sender: string;
  /** Someone it goes to, for the title: "What Jonas sees". */
  recipient?: string | undefined;
  /** When it closes, as the context line says. */
  closesAt: Date;
  /** When it reaches them, for the time beside the message. Now by default. */
  sendsAt?: Date | null | undefined;
  open?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Which message shows. Leave undefined to let the preview keep its own, starting at `defaultView`. */
  view?: PreviewView | undefined;
  defaultView?: PreviewView | undefined;
  onViewChange?: ((view: PreviewView) => void) | undefined;
  /** The trigger's words. "Preview" with an eye by default. */
  children?: ReactNode | undefined;
}

// Slack draws its own messages; this draws their shape in Holler's neutrals, never Slack's brand.
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

/** One message from the Holler app, as Slack lays it out: the avatar, the name, the time. */
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

function SlackFrame({ label, children }: { label: string; children: ReactNode }) {
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

/** A question as a Slack form draws it: radios or checkboxes up to 10, a menu above that. */
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
          // biome-ignore lint/suspicious/noArrayIndexKey: a drawing of the draft, redrawn whole on every edit.
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
      {q.followUp && !q.followUp.onlyAfter && (
        <>
          <p className="font-semibold">{q.followUp.prompt || "Anything to add?"}</p>
          <SlackBox tall>Optional</SlackBox>
        </>
      )}
    </div>
  );
}

function Invite({
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
  let controls: ReactNode;
  if (surface.where === "dm" && only?.type === "text") {
    controls = (
      <span className="grid gap-1.5">
        <SlackBox>Write your answer</SlackBox>
        <span>
          <SlackButton>Send</SlackButton>
        </span>
      </span>
    );
  } else if (surface.where === "dm" && only) {
    controls = (
      <span className="flex flex-wrap gap-1.5">
        {only.options.map((o, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a drawing of the draft, redrawn whole on every edit.
          <SlackButton key={`${i}-${o.label}`}>{o.label || "Option"}</SlackButton>
        ))}
      </span>
    );
  } else if (surface.where === "chase") {
    controls = (
      <span className="flex flex-wrap gap-1.5">
        <SlackButton link>Open the form</SlackButton>
        <SlackButton>I submitted it</SlackButton>
      </span>
    );
  } else {
    controls = (
      <span>
        <SlackButton link={surface.where === "web"}>Answer</SlackButton>
      </span>
    );
  }
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
      {controls}
      <Context>{contextLine(holler, closes)}</Context>
    </SlackMessage>
  );
}

function AfterTap({
  holler,
  title,
  closes,
  time,
}: {
  holler: PreviewHoller;
  title: string;
  closes: string;
  time: string;
}) {
  const surface = answerSurface(holler);
  const only = holler.questions[0];
  if (surface.where === "dm" && only?.type === "text") {
    return (
      <SlackMessage time={time}>
        <p className="font-semibold">{title}</p>
        <p>Thanks. Your answer is in.</p>
        <Context>
          {holler.anonymous ? "Answered anonymously" : "You can change it until it closes."}
        </Context>
      </SlackMessage>
    );
  }
  if (surface.where === "dm" && only) {
    return (
      <SlackMessage time={time}>
        <p className="font-semibold">{title}</p>
        <span className="flex flex-wrap gap-1.5">
          {only.options.map((o, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a drawing of the draft, redrawn whole on every edit.
            <SlackButton key={`${i}-${o.label}`} picked={i === 0}>
              {o.label || "Option"}
            </SlackButton>
          ))}
        </span>
        <p className="font-semibold">
          Thanks. {only.followUp?.prompt.trim() || "Anything to add?"}
        </p>
        <SlackBox>Optional. Press Enter to send</SlackBox>
        {holler.anonymous && <Context>Answered anonymously</Context>}
      </SlackMessage>
    );
  }
  if (surface.where === "chase") {
    return (
      <SlackMessage time={time}>
        <p className="font-semibold">{title}</p>
        <p>Thanks. You said you submitted it, so Holler will stop reminding you.</p>
        <Context>{contextLine(holler, closes)}</Context>
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
              // biome-ignore lint/suspicious/noArrayIndexKey: a drawing of the draft, redrawn whole on every edit.
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
          // biome-ignore lint/suspicious/noArrayIndexKey: a drawing of the draft, redrawn whole on every edit.
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

function Reminder({
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
  return (
    <SlackMessage time={time}>
      <p>
        A reminder: <span className="font-semibold">{sender}</span> still needs your answer to{" "}
        <span className="italic">{title}</span>
      </p>
      <span className="flex flex-wrap gap-1.5">
        <SlackButton link={holler.mode === "chase"}>
          {holler.mode === "chase" ? "Open the form" : "Answer now"}
        </SlackButton>
        <SlackButton>Remind me later</SlackButton>
      </span>
      <Context>{contextLine(holler, closes)}</Context>
    </SlackMessage>
  );
}

/** The views, named for what the recipient just did. */
function viewLabel(view: PreviewView, holler: PreviewHoller): string {
  if (view === "dm") return "The DM";
  if (view === "reminder") return "A reminder";
  return holler.mode === "chase" ? "After I submitted it" : "After a tap";
}

/**
 * What a recipient sees in Slack for this draft, opened from a Preview button: the DM, what
 * follows a tap, and a reminder. The shape follows where it is answered, as Slack delivery
 * builds it. A Dialog on a desktop, a sheet on a phone.
 */
function SlackPreview({
  holler,
  sender,
  recipient,
  closesAt,
  sendsAt,
  open,
  defaultOpen,
  onOpenChange,
  view: viewProp,
  defaultView = "dm",
  onViewChange,
  children,
  className,
  ...props
}: Props) {
  const [view, setView] = useControllableState<PreviewView>({
    value: viewProp,
    defaultValue: defaultView,
    onChange: onViewChange,
  });
  const surface = answerSurface(holler);
  const reason = webReason(surface);
  const title = hollerTitle(holler).trim() || "Untitled";
  const closes = dayTime(closesAt);
  const sent = clockTime(sendsAt ?? new Date());
  const later = clockTime(new Date((sendsAt ?? new Date()).getTime() + 60_000));
  const reminderAt = clockTime(new Date((sendsAt ?? new Date()).getTime() + 24 * 3600_000));
  const views: PreviewView[] = ["dm", "tap", "reminder"];
  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="secondary" className={className} {...props}>
            {children ?? (
              <>
                <Eye aria-hidden />
                Preview
              </>
            )}
          </Button>
        }
      />
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{recipient ? `What ${recipient} sees` : "What people see"}</DialogTitle>
          <DialogDescription>
            {answeredInLabel(surface)}.{" "}
            {surface.where === "chase"
              ? "Holler reminds people until they say they submitted it."
              : reason}
          </DialogDescription>
        </DialogHeader>
        <Segmented<PreviewView>
          aria-label="Which message"
          value={view}
          onValueChange={setView}
          className="w-fit max-w-full overflow-x-auto"
        >
          {views.map((v) => (
            <SegmentedItem key={v} value={v} className="whitespace-nowrap">
              {viewLabel(v, holler)}
            </SegmentedItem>
          ))}
        </Segmented>
        <div className="-mx-1 h-[min(22rem,55dvh)] overflow-y-auto px-1 py-1" aria-live="polite">
          {view === "dm" && (
            <SlackFrame label="The invite in Slack">
              <Invite holler={holler} sender={sender} title={title} closes={closes} time={sent} />
            </SlackFrame>
          )}
          {view === "tap" &&
            (surface.where === "dm" || surface.where === "chase" ? (
              <SlackFrame label="The DM after answering">
                <AfterTap holler={holler} title={title} closes={closes} time={later} />
              </SlackFrame>
            ) : (
              <AfterTap holler={holler} title={title} closes={closes} time={later} />
            ))}
          {view === "reminder" && (
            <SlackFrame label="A reminder in Slack">
              <Reminder
                holler={holler}
                sender={sender}
                title={title}
                closes={closes}
                time={reminderAt}
              />
            </SlackFrame>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary">Done</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { SlackPreview };
