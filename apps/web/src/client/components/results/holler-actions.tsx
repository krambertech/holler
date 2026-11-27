import { Copy, Download, Ellipsis, FileText, Lock, Repeat, UserPlus } from "lucide-react";
import { type ComponentProps, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import { count, shortDate } from "@/lib/format";

interface Props extends ComponentProps<"div"> {
  hollerId: string;
  status: "draft" | "scheduled" | "live" | "closed";
  isCreator: boolean;
  canExport: boolean;
  waitingCount: number;
  onCopyAsMarkdown: () => void;
  onCopyIntoDraft: () => void;
  onClose: () => void;
  onShare?: (() => void) | undefined;
  copying?: boolean | undefined;
  closing?: boolean | undefined;
  repeats?: boolean | undefined;
  nextRoundAt?: string | null | undefined;
  onStopRepeating?: (() => void) | undefined;
  stopping?: boolean | undefined;
}

function HollerActions({
  hollerId,
  status,
  isCreator,
  canExport,
  waitingCount,
  onCopyAsMarkdown,
  onCopyIntoDraft,
  onClose,
  onShare,
  copying = false,
  closing = false,
  repeats = false,
  nextRoundAt = null,
  onStopRepeating,
  stopping = false,
  className,
  ...props
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [stoppingRepeat, setStoppingRepeat] = useState(false);
  const exportHref = (format: "csv" | "md") => `/api/hollers/${hollerId}/export?format=${format}`;
  return (
    <div
      data-slot="holler-actions"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    >
      {isCreator && onShare && (
        <Button size="sm" onClick={onShare}>
          <UserPlus aria-hidden />
          Share
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!canExport}
          title={canExport ? undefined : "Export opens with the results."}
          render={<Button size="sm" />}
        >
          {canExport ? <Download aria-hidden /> : <Lock aria-hidden />}
          Export
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label="Export" align="end">
          <DropdownMenuLinkItem render={<a href={exportHref("csv")} download />}>
            <Download />
            Download CSV
          </DropdownMenuLinkItem>
          <DropdownMenuLinkItem render={<a href={exportHref("md")} download />}>
            <FileText />
            Download Markdown
          </DropdownMenuLinkItem>
          <DropdownMenuItem onClick={onCopyAsMarkdown}>
            <Copy />
            Copy as Markdown
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {isCreator && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="icon-sm" aria-label="More for this Holler" pending={copying} />}
          >
            <Ellipsis aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label="This Holler" align="end">
            <DropdownMenuItem onClick={onCopyIntoDraft}>
              <Copy />
              Duplicate
            </DropdownMenuItem>
            {repeats && onStopRepeating && (
              <DropdownMenuItem onClick={() => setStoppingRepeat(true)}>
                <Repeat />
                Stop repeating
              </DropdownMenuItem>
            )}
            {status === "live" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem tone="danger" onClick={() => setConfirming(true)}>
                  <Lock />
                  Close now
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Dialog open={stoppingRepeat} onOpenChange={setStoppingRepeat}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop repeating this pulse?</DialogTitle>
            <DialogDescription>
              {nextRoundAt
                ? `The next round, on ${shortDate(nextRoundAt)}, is deleted. Every round so far and its answers stay.`
                : "No more rounds go out. Every round so far and its answers stay."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Keep repeating</Button>} />
            <Button
              variant="primary"
              pending={stopping}
              onClick={() => {
                onStopRepeating?.();
                setStoppingRepeat(false);
              }}
            >
              Stop repeating
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close this Holler?</DialogTitle>
            <DialogDescription>
              {waitingCount === 0
                ? "Everyone has answered. Closing it now takes no more answers."
                : waitingCount === 1
                  ? "1 person has not answered yet. Closing stops their reminders, and nobody can answer after this."
                  : `${count(waitingCount)} people have not answered yet. Closing stops their reminders, and nobody can answer after this.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Keep it open</Button>} />
            <Button
              variant="primary"
              pending={closing}
              onClick={() => {
                onClose();
                setConfirming(false);
              }}
            >
              Close now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { HollerActions };
