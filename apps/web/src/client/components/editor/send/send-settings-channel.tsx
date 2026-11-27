import { Hash } from "lucide-react";
import { useState } from "react";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { peopleLabel } from "@/lib/format";
import { type DirectoryGroup, type DirectorySearch, useDirectory } from "./directory";

function SendSettingsChannel({
  channel,
  onChannel,
  search,
}: {
  channel: DirectoryGroup | null;
  onChannel: (channel: DirectoryGroup) => void;
  search: DirectorySearch;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const directory = useDirectory(search, query, open);
  const channels = (directory.data?.groups ?? []).filter((g) => g.kind === "channel");
  return (
    <Field className="sm:max-w-sm">
      <FieldLabel>Channel</FieldLabel>
      <Combobox<DirectoryGroup>
        items={channels}
        filter={null}
        value={channel}
        onValueChange={(next) => next && onChannel(next)}
        inputValue={query}
        onInputValueChange={setQuery}
        open={open}
        onOpenChange={setOpen}
        isItemEqualToValue={(a, b) => a.slackId === b.slackId}
        itemToStringLabel={(g) => `#${g.name}`}
      >
        <ComboboxTrigger>
          <ComboboxValue placeholder="Pick a channel" />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="Search channels" />
          <ComboboxEmpty>
            {channels.length > 0
              ? null
              : directory.isError
                ? "We could not load the channels. Close this and try again."
                : !directory.data
                  ? "Searching channels"
                  : "No channel by that name. Holler sees public channels and the private ones it was added to."}
          </ComboboxEmpty>
          <ComboboxList>
            {(g: DirectoryGroup) => (
              <ComboboxItem
                key={g.slackId}
                value={g}
                description={g.memberCount == null ? undefined : peopleLabel(g.memberCount)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Hash className="size-4 text-muted" aria-hidden />
                  <span className="truncate">{g.name}</span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}

export { SendSettingsChannel };
