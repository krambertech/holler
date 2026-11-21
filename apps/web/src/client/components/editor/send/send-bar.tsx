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

export interface BigSend {
  title: string;
  reach: Reach;
  chosen: AudienceEntry[];
  when: string;
  scheduled: boolean;
}

const SHOWN = 8;

function question(send: BigSend) {
  const { reach } = send;
  if (reach.everyone) return send.scheduled ? "Schedule it for everyone?" : "Send it to everyone?";
  if (reach.unknown) {
    return send.scheduled
      ? "Schedule it for everyone you chose?"
      : "Send it to everyone you chose?";
  }
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
  } else if (reach.unknown) {
    who = "everyone you chose";
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
  if (!reach.everyone && reach.unknown) {
    sentences.push("Holler does not know yet how many people are in every group.");
  }
  if (!reach.everyone && !reach.exact) sentences.push("Anyone in two groups gets it once.");
  if (!send.scheduled) sentences.push("A sent Holler cannot be called back.");
  return sentences.join(" ");
}

interface SendButtonProps extends Omit<ComponentProps<typeof Button>, "onClick" | "variant"> {
  send?: BigSend | undefined;
  onSend: () => void;
  children: ReactNode;
}

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
  children: ReactNode;
  description?: ReactNode | undefined;
  tone?: "neutral" | "danger" | undefined;
  secondary?: ReactNode | undefined;
  action: ReactNode;
}

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
