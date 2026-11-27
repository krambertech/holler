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
import { HollerEditorTagsField } from "./holler-editor-tags-field";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: string[];
  suggestions: string[];
  onTags: (tags: string[]) => void;
}

function HollerEditorTags({ open, onOpenChange, tags, suggestions, onTags }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-slot="holler-editor-tags" size="md">
        <DialogHeader>
          <DialogTitle>Tags</DialogTitle>
          <DialogDescription>Tags help you find it later on Home.</DialogDescription>
        </DialogHeader>
        <HollerEditorTagsField tags={tags} suggestions={suggestions} onTags={onTags} />
        <DialogFooter>
          <DialogClose render={<Button variant="primary">Done</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { HollerEditorTags };
