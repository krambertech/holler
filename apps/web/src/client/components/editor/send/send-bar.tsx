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

const SHOWN = 8;

function question(send: BigSend) {
  const { reach } = send;
  if (reach.everyone) return send.scheduled ? "Schedule it for everyone?" : "Send it to everyone?";
  const n = reach.exact ? peopleLabel(reach.count) : `about ${count(reach.count)} people`;
  return send.scheduled ? `Schedule it for ${n}?` : `Send it to ${n}?`;
}

function explanation(send: BigSend) {
  const { reach } = send;
  let who: string;
  if (reach.everyone) {
    who = reach.exact
      ? `everyone in the workspace, ${peopleLabel(reach.count).toLocaleLowerCase()},`
      : "everyone in the workspace";
  } else {
    who = reach.exact
      ? peopleLabel(reach.count).toLocaleLowerCase()
      : `about ${count(reach.count)} people`;
  }
  const sentences = [
    send.scheduled
      ? `"${send.title}" goes to ${who} on ${send.when}. Each of them gets a DM.`
      : `"${send.title}" goes to ${who} now. Each of them gets a DM.`,
  ];
  if (!reach.everyone && !reach.exact) sentences.push("Anyone in two groups gets it once.");
  if (!send.scheduled) sentences.push("A sent Holler cannot be called back.");
  return sentences.join(" ");
}

interface SendButtonProps extends Omit<ComponentProps<typeof Button>, "onClick" | "variant"> {
  /**
   * The send this press makes. Sending to everyone or to more than 50 people asks once more in a
   * dialog that shows who it reaches; a smaller send, or none given, goes at once.
   */
  send?: BigSend | undefined;
  /** Runs on the press, or after "Send" in the dialog when it asks. */
  onSend: () => void;
  /** The words on the button, which the dialog's own button repeats: "Send to 14 people". */
  children: ReactNode;
}

/** The plum button that sends a Holler. It asks once more before a big send. */
function SendButton({ send, onSend, children, ...props }: SendButtonProps) {
  const [asking, setAsking] = useState(false);
  const shown = send?.chosen.slice(0, SHOWN) ?? [];
  const more = (send?.chosen.length ?? 0) - shown.length;
  return (
    <>
      <Button
        data-slot="send-button"
        variant="primary"
        onClick={() => (send && isBigSend(send.reach) ? setAsking(true) : onSend())}
        {...props}
      >
        {children}
      </Button>
      {send && (
        <Dialog open={asking} onOpenChange={setAsking}>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>{question(send)}</DialogTitle>
              <DialogDescription>{explanation(send)}</DialogDescription>
            </DialogHeader>
            {!send.reach.everyone && shown.length > 0 && (
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
                  setAsking(false);
                  onSend();
                }}
              >
                {children}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

interface SendBarProps extends ComponentProps<"div"> {
  /** What the next press does, or the one thing to fix: "14 people, now". */
  children: ReactNode;
  /** A second line under it: "Closes Mon 24 Nov, 17:00". */
  description?: ReactNode | undefined;
  /** `danger` when the children name a problem to fix. */
  tone?: "neutral" | "danger" | undefined;
  /** A button before the plum one, such as going back to Compose. Hidden on a phone. */
  secondary?: ReactNode | undefined;
  /** The plum button: a `SendButton` on Send, a primary `Button` on Compose. Full width on a phone. */
  action: ReactNode;
}

/**
 * The bar at the bottom of Compose and Send. It rides along at the bottom of the window while the
 * page scrolls and settles into place at the end of the page, so it never covers the last row.
 * Left, what the next press does; right, the one plum button. Put it last in the page column.
 */
function SendBar({
  children,
  description,
  tone = "neutral",
  secondary,
  action,
  className,
  ...props
}: SendBarProps) {
  const end = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState(true);

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
              <span className="min-w-0">{children}</span>
            </span>
            {description && (
              <span className="truncate text-muted text-sm tabular">{description}</span>
            )}
          </div>
          <div className="flex grow items-center justify-end gap-2 sm:grow-0">
            {secondary && <div className="max-sm:hidden">{secondary}</div>}
            <div className="flex max-sm:grow max-sm:*:grow">{action}</div>
          </div>
        </div>
      </div>
      <div ref={end} aria-hidden className="h-px" />
    </>
  );
}

export { SendBar, SendButton };
