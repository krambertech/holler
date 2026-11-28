import { answerSurface, hollerTitle } from "@holler/core";
import { Eye } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
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
import { useControllableState } from "@/lib/use-controllable-state";
import { answeredInLabel, clockTime, dayTime, webReason } from "./send-logic";

import {
  type PreviewHoller,
  SlackPreviewAfterTap,
  SlackPreviewFrame,
  SlackPreviewInvite,
  SlackPreviewReminder,
} from "./slack-preview-parts";

export type { PreviewHoller } from "./slack-preview-parts";

export type PreviewView = "dm" | "tap" | "reminder";

interface Props extends ComponentProps<"button"> {
  holler: PreviewHoller;
  sender: string;
  recipient?: string | undefined;
  closesAt: Date;
  sendsAt?: Date | null | undefined;
  open?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  view?: PreviewView | undefined;
  defaultView?: PreviewView | undefined;
  onViewChange?: ((view: PreviewView) => void) | undefined;
  children?: ReactNode | undefined;
  variant?: "secondary" | "ghost" | undefined;
}

function viewLabel(view: PreviewView, holler: PreviewHoller): string {
  if (view === "dm") return "The DM";
  if (view === "reminder") return "A reminder";
  return holler.mode === "chase" ? "After I submitted it" : "After a tap";
}

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
  variant = "secondary",
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
          <Button variant={variant} className={className} {...props}>
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
            <SlackPreviewFrame label="The invite in Slack">
              <SlackPreviewInvite
                holler={holler}
                sender={sender}
                title={title}
                closes={closes}
                time={sent}
              />
            </SlackPreviewFrame>
          )}
          {view === "tap" &&
            (surface.where === "dm" || surface.where === "chase" ? (
              <SlackPreviewFrame label="The DM after answering">
                <SlackPreviewAfterTap holler={holler} title={title} time={later} />
              </SlackPreviewFrame>
            ) : (
              <SlackPreviewAfterTap holler={holler} title={title} time={later} />
            ))}
          {view === "reminder" && (
            <SlackPreviewFrame label="A reminder in Slack">
              <SlackPreviewReminder
                holler={holler}
                sender={sender}
                title={title}
                closes={closes}
                time={reminderAt}
              />
            </SlackPreviewFrame>
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
