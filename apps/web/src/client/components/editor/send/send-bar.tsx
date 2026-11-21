import { CircleAlert } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { count, peopleLabel } from "@/lib/format";
import { type AudienceEntry, entryName } from "./directory";
import { isBigSend, type Reach } from "./send-logic";

/** What the big-send question shows: the Holler, who it reaches, and when. */
export interface BigSend {
  title: string;
  reach: Reach;
  chosen: AudienceEntry[];
  /** "now", or the day and time it is scheduled for. */
  when: string;
  scheduled: boolean;
}

interface Props extends Omit<ComponentProps<"div">, "title"> {
  /** What the next press does, or the one thing to fix. */
  title: ReactNode;
  detail?: ReactNode | undefined;
  /** `danger` when `title` is a problem to fix. */
  tone?: "neutral" | "danger" | undefined;
  /** A button beside the plum one, such as going back to Compose. Hidden on a phone. */
  secondary?: ReactNode | undefined;
  /** The plum button's words, naming the reach: "Send to 14 people". */
  action: string;
  onAction: () => void;
  pending?: boolean | undefined;
  disabled?: boolean | undefined;
  /**
   * The send, when this press sends. Sending to everyone or to more than 50 people asks once more
   * in a dialog that shows who it reaches; a smaller send goes at once.
   */
  send?: BigSend | undefined;
}

const SHOWN = 8;

function BigSendDialog({
  send,
  action,
  open,
  onOpenChange,
  onConfirm,
}: {
  send: BigSend;
  action: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { reach } = send;
  const shown = send.chosen.slice(0, SHOWN);
  const more = send.chosen.length - shown.length;
  let question: string;
  if (reach.everyone) {
    question = send.scheduled ? "Schedule it for everyone?" : "Send it to everyone?";
  } else {
    const n = reach.exact ? peopleLabel(reach.count) : `about ${count(reach.count)} people`;
    question = send.scheduled ? `Schedule it for ${n}?` : `Send it to ${n}?`;
  }
  let reachText: string;
  if (reach.everyone) {
    reachText = reach.exact
      ? `everyone in the workspace, ${peopleLabel(reach.count).toLocaleLowerCase()},`
      : "everyone in the workspace";
  } else {
    reachText = reach.exact
      ? peopleLabel(reach.count).toLocaleLowerCase()
      : `about ${count(reach.count)} people`;
  }
  const sentences = [
    send.scheduled
      ? `"${send.title}" goes to ${reachText} on ${send.when}. Each of them gets a DM.`
      : `"${send.title}" goes to ${reachText} now. Each of them gets a DM.`,
  ];
  if (!reach.everyone && !reach.exact) sentences.push("Anyone in two groups gets it once.");
  if (!send.scheduled) sentences.push("A sent Holler cannot be called back.");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{question}</DialogTitle>
          <DialogDescription>{sentences.join(" ")}</DialogDescription>
        </DialogHeader>
        {!reach.everyone && shown.length > 0 && (
          <ul aria-label="Who it reaches" className="flex flex-wrap gap-1.5">
            {shown.map((entry) => (
              <li
                key={entry.id}
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-well px-2.5 text-ink text-sm"
              >
                {entryName(entry)}
                {entry.kind === "group" && entry.group.memberCount != null && (
                  <span className="text-muted tabular">{count(entry.group.memberCount)}</span>
                )}
              </li>
            ))}
            {more > 0 && (
              <li className="inline-flex h-7 items-center px-1 text-muted text-sm">
                {more === 1 ? "and 1 more" : `and ${count(more)} more`}
              </li>
            )}
          </ul>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Go back</Button>} />
          <Button
            variant="primary"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The bar at the bottom of Compose and Send. It rides along at the bottom of the window while the
 * page scrolls and settles into place at the end of the page, so it never covers the last row.
 * Left, what the next press does; right, the one plum button.
 */
function SendBar({
  title,
  detail,
  tone = "neutral",
  secondary,
  action,
  onAction,
  pending,
  disabled,
  send,
  className,
  ...props
}: Props) {
  const end = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState(true);
  const [asking, setAsking] = useState(false);

  // The bar floats while the end of the page is below the window, and rests once it is in view.
  useEffect(() => {
    const el = end.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) =>
      setSettled(Boolean(entry?.isIntersecting)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const press = () => {
    if (send && isBigSend(send.reach)) setAsking(true);
    else onAction();
  };

  return (
    <>
      <div
        data-slot="send-bar"
        data-settled={settled || undefined}
        className={cn(
          "sticky bottom-0 z-(--z-sticky) pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-plate py-2.5 ps-5 pe-2.5 transition-shadow duration-200 ease-(--ease-out) max-sm:px-4",
            settled ? "bg-plate edge" : "floating",
          )}
        >
          {/* A phone puts the button on its own line before it cuts the words short. */}
          <div className="grid min-w-0 flex-1 basis-44 leading-snug" aria-live="polite">
            <span
              className={cn(
                "flex min-w-0 items-start gap-1.5 text-pretty font-normal tabular",
                tone === "danger" ? "text-danger-ink" : "text-ink",
              )}
            >
              {tone === "danger" && <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
              <span className="min-w-0">{title}</span>
            </span>
            {detail && <span className="truncate text-muted text-sm tabular">{detail}</span>}
          </div>
          <div className="flex grow items-center justify-end gap-2 sm:grow-0">
            {secondary && <div className="max-sm:hidden">{secondary}</div>}
            <Button
              variant="primary"
              pending={pending}
              disabled={disabled}
              onClick={press}
              className="max-sm:grow"
            >
              {action}
            </Button>
          </div>
        </div>
      </div>
      <div ref={end} aria-hidden className="h-px" />
      {send && (
        <BigSendDialog
          send={send}
          action={action}
          open={asking}
          onOpenChange={setAsking}
          onConfirm={onAction}
        />
      )}
    </>
  );
}

export { SendBar };
