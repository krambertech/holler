import type { SharingOut } from "@holler/core";
import { Link2Off, X } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { CopyButton } from "@/components/api-keys/parts";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface ShareCandidate {
  slackUserId: string;
  name: string;
  avatarUrl: string | null;
}

interface PersonItem {
  value: string;
  label: string;
  avatarUrl: string | null;
  shared: boolean;
}

interface Props extends Omit<ComponentProps<typeof Dialog>, "children"> {
  sharing: SharingOut | undefined;
  canMakeLink: boolean;
  candidates: ShareCandidate[];
  onSearch: (query: string) => void;
  onVisibility: (visibility: SharingOut["visibility"]) => void;
  onAdd: (slackUserId: string) => void;
  onRemove: (slackUserId: string) => void;
  onMakeLink: () => void;
  onTurnOffLink: () => void;
  adding?: boolean | undefined;
  linking?: boolean | undefined;
}

function ShareDialog({
  sharing,
  canMakeLink,
  candidates,
  onSearch,
  onVisibility,
  onAdd,
  onRemove,
  onMakeLink,
  onTurnOffLink,
  adding = false,
  linking = false,
  ...props
}: Props) {
  const [picked, setPicked] = useState<PersonItem | null>(null);
  const shared = new Set(sharing?.viewers.map((v) => v.slackUserId));
  const items: PersonItem[] = candidates.map((c) => ({
    value: c.slackUserId,
    label: c.name,
    avatarUrl: c.avatarUrl,
    shared: shared.has(c.slackUserId),
  }));
  return (
    <Dialog {...props}>
      <DialogContent size="md" data-slot="share-dialog">
        <DialogHeader>
          <DialogTitle>Share results</DialogTitle>
          <DialogDescription>Choose who sees how this Holler went, besides you.</DialogDescription>
        </DialogHeader>

        <RadioGroup
          aria-label="Who can see the results"
          value={sharing?.visibility ?? "private"}
          onValueChange={(value) => onVisibility(value as SharingOut["visibility"])}
          disabled={!sharing}
          className="grid gap-2.5"
        >
          <Field orientation="horizontal">
            <RadioGroupItem value="private" />
            <FieldLabel>You and the people you add</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <RadioGroupItem value="workspace" />
            <FieldLabel>Everyone in the workspace who uses Holler</FieldLabel>
          </Field>
        </RadioGroup>

        <Field>
          <FieldLabel>People</FieldLabel>
          <Combobox<PersonItem>
            items={items}
            value={picked}
            onValueChange={(person) => {
              setPicked(null);
              if (person && !person.shared) onAdd(person.value);
            }}
            onInputValueChange={(query) => onSearch(query)}
            isItemEqualToValue={(a, b) => a.value === b.value}
            disabled={!sharing || adding}
          >
            <ComboboxTrigger>
              <ComboboxValue placeholder="Add someone from Slack" />
            </ComboboxTrigger>
            <ComboboxContent>
              <ComboboxInput placeholder="Search people" />
              <ComboboxEmpty>Nobody by that name in this workspace.</ComboboxEmpty>
              <ComboboxList>
                {(person: PersonItem) => (
                  <ComboboxItem
                    key={person.value}
                    value={person}
                    disabled={person.shared}
                    description={person.shared ? "Already shared with them" : undefined}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Avatar
                        name={person.label}
                        seed={person.value}
                        src={person.avatarUrl}
                        size="sm"
                      />
                      <span className="truncate">{person.label}</span>
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <FieldDescription>
            Each person you add gets a message in Slack with a link.
          </FieldDescription>
        </Field>

        {sharing && sharing.viewers.length > 0 && (
          <ul aria-label="Shared with" className="-my-1 grid">
            {sharing.viewers.map((viewer) => (
              <li key={viewer.slackUserId} className="flex items-center gap-3 py-1.5">
                <Avatar name={viewer.name} seed={viewer.slackUserId} src={viewer.avatarUrl} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-base">{viewer.name}</span>
                  {!viewer.member && (
                    <span className="text-muted text-sm">Sees it once they sign in to Holler</span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Stop sharing with ${viewer.name}`}
                  onClick={() => onRemove(viewer.slackUserId)}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Field>
          <FieldLabel>Report link</FieldLabel>
          {sharing?.reportUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                readOnly
                value={sharing.reportUrl}
                aria-label="Report link"
                className="min-w-0 flex-1 basis-56 text-sm"
                onFocus={(event) => event.currentTarget.select()}
              />
              <CopyButton text={sharing.reportUrl} aria-label="Copy the report link" />
              <Button size="sm" variant="ghost" pending={linking} onClick={onTurnOffLink}>
                <Link2Off aria-hidden />
                Turn off
              </Button>
            </div>
          ) : (
            <div>
              <Button
                size="sm"
                pending={linking}
                disabled={!sharing || !canMakeLink}
                onClick={onMakeLink}
              >
                Make a report link
              </Button>
            </div>
          )}
          <FieldDescription>
            {canMakeLink
              ? "A read-only page of the results for anyone with the link, inside or outside Slack. It names no one."
              : "A report link can be made once the Holler is sent."}
          </FieldDescription>
        </Field>

        <div className="flex justify-end">
          <DialogClose render={<Button>Done</Button>} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ShareDialog };
