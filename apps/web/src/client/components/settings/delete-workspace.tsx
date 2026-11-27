import type { SettingsWorkspace } from "@holler/core";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Plate, PlateRow } from "@/components/ui/plate";
import { longDate } from "@/lib/format";

interface Props extends ComponentProps<"div"> {
  workspace: Pick<SettingsWorkspace, "name" | "deletesAt" | "teamRenews">;
  onDelete: (confirmName: string) => Promise<void>;
  error?: string | undefined;
}

function DeleteWorkspace({ workspace, onDelete, error, className, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const matches = typed.trim() === workspace.name.trim();

  async function confirm() {
    setPending(true);
    try {
      await onDelete(typed);
    } finally {
      setPending(false);
    }
  }

  return (
    <Plate data-slot="delete-workspace" className={className} {...props}>
      <PlateRow className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span>Delete {workspace.name}’s data</span>
          <span className="max-w-[60ch] text-ink-2 text-sm">
            {workspace.teamRenews
              ? "Cancel Team in Manage billing first. Holler deletes nothing while the workspace pays for Team."
              : workspace.deletesAt
                ? `Holler deletes it on ${longDate(workspace.deletesAt)} unless someone adds Holler to Slack again. You can delete it now.`
                : "Every Holler and answer, every member, API key and connected app. Holler also leaves Slack."}
          </span>
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setTyped("");
          }}
        >
          <DialogTrigger
            disabled={workspace.teamRenews}
            render={<Button size="sm">Delete data</Button>}
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {workspace.name}’s data?</DialogTitle>
              <DialogDescription>
                Every Holler and answer, every member, API key and connected app go now, and Holler
                leaves Slack. Messages Holler already sent stay in Slack. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <form
              className="contents"
              onSubmit={(event) => {
                event.preventDefault();
                if (matches) void confirm();
              }}
            >
              <Field invalid={!!error}>
                <FieldLabel>Type {workspace.name} to confirm</FieldLabel>
                <Input
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <FieldError>{error}</FieldError>
              </Field>
              <DialogFooter>
                <DialogClose render={<Button variant="ghost">Keep it</Button>} />
                <Button type="submit" variant="primary" disabled={!matches} pending={pending}>
                  Delete data
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PlateRow>
    </Plate>
  );
}

export { DeleteWorkspace };
