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
import { toast } from "@/components/ui/toast";
import { Variants } from "../frame";
import type { Group } from "./types";

function CloseDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button>Close now</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close this Holler?</DialogTitle>
          <DialogDescription>
            5 people have not answered yet. Closing stops their reminders, and nobody can answer
            after this.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Keep it open</Button>} />
          <DialogClose render={<Button variant="primary">Close now</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToastButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => toast.add({ title: "Reminder sent to 5 people." })}>
        Reminder sent
      </Button>
      <Button
        onClick={() =>
          toast.add({
            title: "Closed “How was your week?”",
            actionProps: { children: "Undo", onClick: () => {} },
          })
        }
      >
        With Undo
      </Button>
      <Button
        onClick={() =>
          toast.add({
            tone: "danger",
            title: "We could not send the reminder. Check your connection and try again.",
          })
        }
      >
        Error
      </Button>
    </div>
  );
}

export const overlays: Group = {
  slug: "overlays",
  title: "Dialogs and toasts",
  lede: "A dialog asks before something that cannot be undone; anything that can be undone gets a toast with Undo instead. On a phone a dialog rises as a sheet and swipes away.",
  entries: [
    {
      slug: "dialog",
      name: "Dialog, Drawer",
      source: "components/ui/dialog.tsx",
      note: "Centred on a desktop, a sheet from the bottom on touch (the Drawer, which no screen uses directly). Focus moves in and returns to the button that opened it. The primary action is plum and last.",
      Demo: () => (
        <Variants
          items={[
            { label: "Confirm closing", note: "Press the button.", render: () => <CloseDialog /> },
          ]}
        />
      ),
    },
    {
      slug: "toast",
      name: "Toast",
      source: "components/ui/toast.tsx",
      note: "A short line after something happened, bottom-end on a desktop and bottom centre on a phone. Up to three stack, newest in front. Errors are announced at once.",
      Demo: () => <Variants items={[{ label: "Try it", render: () => <ToastButtons /> }]} />,
    },
  ],
};
