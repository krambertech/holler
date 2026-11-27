import { Check, ChevronLeft, CircleAlert, Ellipsis, LoaderCircle, Tag, Trash2 } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import type { SaveState } from "./use-autosave";

export const backLinkClassName =
  "relative -ms-2 grid size-9 shrink-0 place-items-center rounded-control text-ink-2 outline-none transition-colors hoverable:hover:bg-hover hoverable:hover:text-ink focus-visible:ring-2 focus-visible:ring-focus pointer-coarse:before:absolute pointer-coarse:before:-inset-1 pointer-coarse:before:content-['']";

function SaveStatus({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span aria-live="polite" className="inline-flex items-center gap-1.5 text-muted text-sm">
      {state === "saving" && (
        <>
          <LoaderCircle aria-hidden size={14} className="animate-spin motion-reduce:animate-none" />
          Saving
        </>
      )}
      {state === "saved" && (
        <>
          <Check aria-hidden size={14} strokeWidth={2} />
          Draft saved
        </>
      )}
      {state === "error" && (
        <span className="inline-flex items-center gap-1.5 text-danger-ink">
          <CircleAlert aria-hidden size={14} strokeWidth={2} />
          Could not save. Trying again
        </span>
      )}
    </span>
  );
}

interface Props extends ComponentProps<"div"> {
  back: ReactNode;
  heading: ReactNode;
  saveState: SaveState;
  onTags?: (() => void) | undefined;
  onDelete?: (() => Promise<boolean>) | undefined;
  deleting?: boolean | undefined;
}

function HollerEditorTop({
  back,
  heading,
  saveState,
  onTags,
  onDelete,
  deleting,
  className,
  ...props
}: Props) {
  const [asking, setAsking] = useState(false);
  return (
    <div
      data-slot="holler-editor-top"
      className={cn("flex min-h-10 items-center justify-between gap-3", className)}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-1">
        {back}
        {heading}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SaveStatus state={saveState} />
        {(onTags || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="More for this draft" />}
            >
              <Ellipsis aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent aria-label="This draft" align="end">
              {onTags && (
                <DropdownMenuItem onClick={onTags}>
                  <Tag aria-hidden />
                  Tags
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem tone="danger" onClick={() => setAsking(true)}>
                  <Trash2 aria-hidden />
                  Delete draft
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete this draft?</DialogTitle>
            <DialogDescription>
              It has not been sent, so nobody has seen it. Deleting it cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Keep it</Button>} />
            <Button
              variant="primary"
              pending={deleting}
              onClick={() => {
                void onDelete?.().then((done) => {
                  if (!done) setAsking(false);
                });
              }}
            >
              Delete draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackArrow() {
  return <ChevronLeft aria-hidden size={20} strokeWidth={2} />;
}

export { BackArrow, HollerEditorTop };
