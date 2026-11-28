import { answerSurface } from "@holler/core";
import { CalendarClock, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AudiencePicker } from "@/components/editor/send/audience-picker";
import type { DirectoryCount, DirectorySearch } from "@/components/editor/send/directory";
import { SendBar, SendSplit } from "@/components/editor/send/send-bar";
import {
  answeredInLabel,
  composeBarSummary,
  type SendFields,
  sendBarSummary,
} from "@/components/editor/send/send-logic";
import { type PreviewHoller, SlackPreview } from "@/components/editor/send/slack-preview";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Variants } from "../frame";
import {
  type Audience,
  chase,
  countPeople,
  defaults,
  failingCount,
  failingSearch,
  four,
  fridayFive,
  known,
  mondayNine,
  none,
  pulse,
  pulseWithNote,
  resolve,
  search,
  sendFor,
  slowSearch,
  survey,
  syncingSearch,
  team,
  textPulse,
  three,
  WORKSPACE,
  web,
} from "./sending-fixtures";
import type { Group } from "./types";

function ComposeBarDemo({ problem }: { problem?: string }) {
  const summary = composeBarSummary({ where: "dm" }, 1, problem);
  return (
    <SendBar
      className="w-full"
      description={summary.description}
      tone={summary.tone}
      action={<SplitDemo />}
    >
      {summary.title}
    </SendBar>
  );
}

function SplitDemo({ scheduled = false }: { scheduled?: boolean | undefined }) {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {said && <span className="text-muted text-sm">{said}</span>}
      <SendSplit
        onClick={() => setSaid(scheduled ? "Schedule updated" : "Send dialog opens")}
        options={
          scheduled
            ? [
                {
                  label: "Change the time",
                  icon: <CalendarClock aria-hidden />,
                  onSelect: () => setSaid("Schedule dialog opens"),
                },
                {
                  label: "Send now instead",
                  icon: <Send aria-hidden />,
                  onSelect: () => setSaid("Send dialog opens"),
                },
              ]
            : [
                {
                  label: "Schedule…",
                  icon: <CalendarClock aria-hidden />,
                  onSelect: () => setSaid("Schedule dialog opens"),
                },
              ]
        }
      >
        {scheduled ? "Update schedule" : "Send"}
      </SendSplit>
    </div>
  );
}

function ScheduledBarDemo({ start }: { start: Partial<SendFields> }) {
  const fields = { ...defaults, ...start };
  const send = sendFor(four, fields);
  const context = {
    now: new Date(),
    senderZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    zones: [],
  };
  const summary = sendBarSummary(send.reach, fields, context);
  return (
    <SendBar
      className="w-full"
      description={summary.description}
      secondary={
        <SlackPreview holler={pulse} sender="Mira" closesAt={fridayFive} variant="ghost" />
      }
      action={<SplitDemo scheduled />}
    >
      {summary.title}
    </SendBar>
  );
}

function AnonymousDemo() {
  const [on, setOn] = useState(false);
  return (
    <Field orientation="horizontal" className="w-auto gap-2.5">
      <FieldLabel className="font-normal text-ink-2 text-sm">Anonymous</FieldLabel>
      <Switch size="sm" checked={on} onCheckedChange={setOn} />
    </Field>
  );
}

const isEmpty = (audience: Audience) =>
  !audience.everyone && audience.people.length === 0 && audience.groups.length === 0;

function PickerDemo({
  start,
  problem,
  query,
  paste,
  searchWith = search,
  countWith = countPeople,
  withKnown = true,
}: {
  start: Audience;
  problem?: string;
  query?: string;
  paste?: string;
  searchWith?: DirectorySearch;
  countWith?: DirectoryCount;
  withKnown?: boolean;
}) {
  const [empty, setEmpty] = useState(isEmpty(start));
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const input = ref.current?.querySelector("input");
    if (!paste || !input) return;
    const data = new DataTransfer();
    data.setData("text/plain", paste);
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
  }, [paste]);
  return (
    <AudiencePicker
      ref={ref}
      className="w-full"
      defaultValue={start}
      onValueChange={(next) => setEmpty(isEmpty(next))}
      problem={empty ? problem : undefined}
      known={withKnown ? known : undefined}
      workspaceSize={WORKSPACE}
      search={searchWith}
      resolve={resolve}
      countPeople={countWith}
      defaultInputValue={query}
      inline
      aside={<AnonymousDemo />}
    />
  );
}

function PreviewDemo({
  holler,
  recipient,
  defaultView,
}: {
  holler: PreviewHoller;
  recipient?: string;
  defaultView?: "dm" | "tap" | "reminder";
}) {
  return (
    <SlackPreview
      holler={holler}
      sender="Mira"
      recipient={recipient}
      closesAt={fridayFive}
      sendsAt={mondayNine}
      defaultView={defaultView}
    />
  );
}

const surfaceNote = (holler: PreviewHoller) => answeredInLabel(answerSurface(holler));

export const sending: Group = {
  slug: "sending",
  title: "Sending",
  lede: "Sending a Holler: who gets it, what they see in Slack, and the bar that sends it. The questions Send asks last have their own page.",
  entries: [
    {
      slug: "audience-picker",
      name: "AudiencePicker",
      source: "components/editor/send/audience-picker.tsx",
      note: "The card at the top of the editor, like an email's To line: chips for who is in, then a place to type, and a strip below with how many it reaches and the Anonymous switch. Away from the field, many chips fold to one line ending in +N more; a click opens them all again. Typing lists matches at once, best first: a name that starts with it, then people this sender sends to often. @ searches handles and # channels. Up and Down move, Enter, Tab or a comma adds, Backspace on an empty field reaches the last chip and a second Backspace removes it, with Undo. A pasted list adds every name, handle and email it can match. Here the list sits in the page; in the editor it floats under the field.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "A problem",
              note: "The send refused: its problem sits under the field.",
              render: () => <PickerDemo start={none} problem="Choose who to send it to." />,
            },
            { label: "Empty", render: () => <PickerDemo start={none} /> },
            {
              label: "Typing, with matches",
              note: '"ma": names that start with it first, then a later word. Accents do not matter.',
              render: () => <PickerDemo start={three} query="ma" />,
            },
            {
              label: "Groups and channels",
              note: '"#" lists channels; each says how many people it adds. One already in shows as added.',
              render: () => <PickerDemo start={{ ...none, groups: ["C0LDS"] }} query="#" />,
            },
            {
              label: "Already in",
              render: () => <PickerDemo start={four} query="jonas" />,
            },
            {
              label: "No matches",
              note: "Everyone in the workspace is always offered.",
              render: () => <PickerDemo start={three} query="zed" />,
            },
            {
              label: "Loading",
              render: () => (
                <PickerDemo start={none} query="pri" searchWith={slowSearch} withKnown={false} />
              ),
            },
            {
              label: "The directory is still syncing",
              render: () => <PickerDemo start={none} query="a" searchWith={syncingSearch} />,
            },
            {
              label: "The search failed",
              render: () => (
                <PickerDemo start={none} query="ana" searchWith={failingSearch} withKnown={false} />
              ),
            },
            {
              label: "A pasted list with misses",
              note: "Names, handles and emails, split by lines, commas or semicolons.",
              render: () => (
                <PickerDemo start={none} paste={"Jonas Berg\n@ana.t, kai\nzed@acme.com; Ma"} />
              ),
            },
            {
              label: "Groups and people",
              render: () => (
                <PickerDemo
                  start={{ people: ["U0JB", "U0AT"], groups: ["S0DES", "C0LDS"], everyone: false }}
                />
              ),
            },
            {
              label: "Groups, Slack not answering",
              note: "Without Slack's member lists the count is an estimate, so it says about.",
              render: () => (
                <PickerDemo
                  start={{ people: ["U0JB"], groups: ["S0DES"], everyone: false }}
                  countWith={failingCount}
                />
              ),
            },
            {
              label: "Everyone",
              render: () => <PickerDemo start={{ people: [], groups: [], everyone: true }} />,
            },
            {
              label: "Many chips",
              note: "Folded to one line until you click in; then the field grows, then scrolls.",
              render: () => (
                <PickerDemo
                  start={{
                    people: team.map((p) => p.slackUserId),
                    groups: ["S0ENG", "C0GEN", "S0DES", "C0LDS"],
                    everyone: false,
                  }}
                />
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "slack-preview",
      name: "SlackPreview",
      source: "components/editor/send/slack-preview.tsx",
      note: "Preview opens what a recipient sees in Slack: the DM, what follows a tap, and a reminder, shaped by where it is answered. Drawn in Holler's neutrals, never Slack's brand. Pass view and onViewChange to choose the message from outside.",
      Demo: () => (
        <Variants
          items={[
            {
              label: surfaceNote(pulse),
              note: "A pulse of one single choice.",
              render: () => <PreviewDemo holler={pulse} recipient="Jonas" />,
            },
            {
              label: "A follow-up note in the DM",
              note: "After a tap asks for a note. Without a follow-up, it only says thanks.",
              render: () => (
                <PreviewDemo holler={pulseWithNote} recipient="Jonas" defaultView="tap" />
              ),
            },
            {
              label: "Free text in the DM",
              note: "Anonymous.",
              render: () => <PreviewDemo holler={textPulse} />,
            },
            {
              label: surfaceNote(survey),
              render: () => <PreviewDemo holler={survey} recipient="Ana" />,
            },
            {
              label: surfaceNote(web),
              note: "A note only after some answers.",
              render: () => <PreviewDemo holler={web} />,
            },
            {
              label: "A chase, opening on the reminder",
              render: () => <PreviewDemo holler={chase} recipient="Kai" defaultView="reminder" />,
            },
          ]}
        />
      ),
    },
    {
      slug: "send-bar",
      name: "SendBar",
      source: "components/editor/send/send-bar.tsx",
      note: "The bar at the bottom of the editor. It sits at the bottom of the window and stays in the page's flow, so it never covers the last row. It is raised only while content scrolls under it, and flat when it rests at the end. Its children say where people answer, or what to fix, and the action slot holds the one plum button.",
      Demo: () => (
        <Variants
          stack
          items={[
            { label: "While writing", render: () => <ComposeBarDemo /> },
            {
              label: "With something to fix",
              render: () => <ComposeBarDemo problem="Give the second question a prompt." />,
            },
            {
              label: "Scheduled",
              render: () => <ScheduledBarDemo start={{ sendAt: mondayNine }} />,
            },
          ]}
        />
      ),
    },
    {
      slug: "send-split",
      name: "SendSplit",
      source: "components/editor/send/send-bar.tsx",
      note: "The plum button that sends, with an arrow for the other ways to send. Send and Schedule each open the send dialog; once scheduled, the button updates the schedule and the arrow changes the time or sends now instead.",
      Demo: () => (
        <Variants
          items={[
            { label: "A draft", render: () => <SplitDemo /> },
            { label: "Scheduled", render: () => <SplitDemo scheduled /> },
          ]}
        />
      ),
    },
  ],
};
