import { useState } from "react";
import { HollerEditorTags } from "@/components/editor/holler-editor-tags";
import {
  SendDialog,
  type SendDialogProblems,
  type SendKind,
} from "@/components/editor/send/send-dialog";
import { audienceReach, type SendFields } from "@/components/editor/send/send-logic";
import { Button } from "@/components/ui/button";
import { Variants } from "../frame";
import {
  type Audience,
  big,
  defaults,
  everyone,
  four,
  fridayFive,
  groups,
  mondayNine,
  search,
  sizeOf,
  spread,
  WORKSPACE,
  yesterdayFive,
  zonesOf,
} from "./sending-fixtures";
import type { Group } from "./types";

function DialogDemo({
  kind,
  start = {},
  audience = four,
  rescheduling,
  problems,
  label,
}: {
  kind: SendKind;
  start?: Partial<SendFields>;
  audience?: Audience;
  rescheduling?: boolean;
  problems?: SendDialogProblems;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <Button onClick={() => setOpen(true)}>{label}</Button>
      {said && <span className="text-muted text-sm">{said}</span>}
      <SendDialog
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        rescheduling={rescheduling}
        title="How was your week?"
        value={{ ...defaults, ...start }}
        problems={problems}
        reach={audienceReach(audience, sizeOf, WORKSPACE)}
        context={{
          now: new Date(),
          senderZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          zones: zonesOf(audience.people),
        }}
        knownChannels={groups.filter((g) => g.kind === "channel")}
        search={search}
        onConfirm={() => {
          setOpen(false);
          setSaid(kind === "now" ? "Sent" : "Scheduled");
        }}
      />
    </div>
  );
}

function TagsDemo() {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState(["weekly"]);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Tags</Button>
      <HollerEditorTags
        open={open}
        onOpenChange={setOpen}
        tags={tags}
        suggestions={["weekly", "design", "retro", "offsite", "hiring"]}
        onTags={setTags}
      />
    </>
  );
}

export const sendDialog: Group = {
  slug: "send-dialog",
  title: "Send dialog",
  lede: "What Send and Schedule ask last: reminders, when it closes and a live count, and for a schedule the day, the time and whose clock. Tags live in the editor's menu.",
  entries: [
    {
      slug: "send-dialog",
      name: "SendDialog",
      source: "components/editor/send/send-dialog.tsx",
      note: "A short dialog with the Holler's name and who it reaches at the top, then one row per setting: a switch for reminders, a choice of when it closes, a switch for a live count that asks for its channel. Schedule adds the day, the time and a time zone choice that shows when each zone gets it. Cancel keeps nothing; the plum button names the reach. On a phone it is a sheet.",
      Demo: () => (
        <Variants
          items={[
            { label: "Send now", render: () => <DialogDemo kind="now" label="Send" /> },
            {
              label: "More than 50 people",
              note: "Groups make the count approximate, and the button says so.",
              render: () => <DialogDemo kind="now" audience={big} label="Send" />,
            },
            {
              label: "Everyone, anonymous",
              render: () => (
                <DialogDemo
                  kind="now"
                  audience={everyone}
                  start={{ anonymous: true }}
                  label="Send"
                />
              ),
            },
            {
              label: "Schedule, in each person's time",
              note: "Monday 09:00 on each clock; the rows below say when each zone gets it.",
              render: () => (
                <DialogDemo
                  kind="schedule"
                  audience={spread}
                  start={{ sendAt: mondayNine, sendInRecipientTimeZone: true }}
                  label="Schedule…"
                />
              ),
            },
            {
              label: "Changing a schedule",
              render: () => (
                <DialogDemo
                  kind="schedule"
                  rescheduling
                  start={{ sendAt: mondayNine, closesAt: fridayFive }}
                  label="Change the time"
                />
              ),
            },
            {
              label: "A live count, tagged, no reminders",
              render: () => (
                <DialogDemo
                  kind="now"
                  start={{ announceChannelId: "C0LDS", remindersEnabled: false }}
                  label="Send"
                />
              ),
            },
            {
              label: "A close date in the past",
              render: () => (
                <DialogDemo kind="now" start={{ closesAt: yesterdayFive }} label="Send" />
              ),
            },
            {
              label: "Slack refused it",
              render: () => (
                <DialogDemo
                  kind="now"
                  problems={{ failed: "We could not send it. Try again." }}
                  label="Send"
                />
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "holler-editor-tags",
      name: "HollerEditorTags",
      source: "components/editor/holler-editor-tags.tsx",
      note: "Tags, opened from the editor's menu: type a tag and press Enter or a comma, Backspace on an empty field removes the last one.",
      Demo: () => <TagsDemo />,
    },
  ],
};
