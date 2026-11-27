import { answerSurface } from "@holler/core";
import { useEffect, useRef, useState } from "react";
import { AudiencePicker, type AudienceSummary } from "@/components/editor/send/audience-picker";
import type { DirectorySearch } from "@/components/editor/send/directory";
import { SendBar, SendButton } from "@/components/editor/send/send-bar";
import {
  answeredInLabel,
  closeTime,
  composeBarSummary,
  dayTime,
  type Reach,
  type SendFields,
  sendActionLabel,
  sendBarSummary,
  sendWindow,
} from "@/components/editor/send/send-logic";
import { SendSettings } from "@/components/editor/send/send-settings";
import { type PreviewHoller, SlackPreview } from "@/components/editor/send/slack-preview";
import { useNow } from "@/components/editor/send/use-now";
import { WhenPicker } from "@/components/editor/send/when-picker";
import { Button } from "@/components/ui/button";
import { Variants } from "../frame";
import {
  type Audience,
  big,
  chase,
  defaults,
  everyone,
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
      action={<Button variant="primary">Next: who and when</Button>}
    >
      {summary.title}
    </SendBar>
  );
}

function SendBarDemo({
  audience = four,
  start,
}: {
  audience?: Audience | undefined;
  start?: Partial<SendFields> | undefined;
}) {
  const [sent, setSent] = useState(false);
  const fields = { ...defaults, ...start };
  const send = sendFor(audience, fields);
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
      action={
        <SendButton send={send} onSend={() => setSent(true)}>
          {sendActionLabel(send.reach, send.scheduled)}
        </SendButton>
      }
    >
      {sent ? "Sent. It is on its way." : summary.title}
    </SendBar>
  );
}

function SendButtonDemo({ audience, start }: { audience: Audience; start?: Partial<SendFields> }) {
  const [sent, setSent] = useState(false);
  const send = sendFor(audience, { ...defaults, ...start });
  return (
    <div className="flex items-center gap-3">
      <SendButton send={send} onSend={() => setSent(true)}>
        {sendActionLabel(send.reach, send.scheduled)}
      </SendButton>
      {sent && <span className="text-muted text-sm">Sent</span>}
    </div>
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
  withKnown = true,
}: {
  start: Audience;
  problem?: string;
  query?: string;
  paste?: string;
  searchWith?: DirectorySearch;
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
      defaultInputValue={query}
      inline
    />
  );
}

function SendStageDemo() {
  const [audience, setAudience] = useState<Audience>(four);
  const [fields, setFields] = useState<SendFields>(defaults);
  const [summary, setSummary] = useState<AudienceSummary | null>(null);
  const reach: Reach = summary?.reach ?? { count: 0, exact: true, everyone: false, unknown: false };
  const zones = summary?.zones ?? [];
  const now = useNow();
  const senderZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const bar = sendBarSummary(reach, fields, { now, senderZone, zones });
  const window = sendWindow({
    sendAt: fields.sendAt,
    inRecipientTimeZone: fields.sendInRecipientTimeZone,
    senderZone,
    zones,
    now,
  });
  const empty = reach.count === 0 && !reach.everyone;
  return (
    <div className="h-[34rem] w-full overflow-y-auto rounded-md bg-canvas edge">
      <div className="mx-auto grid max-w-[45rem] gap-8 px-4 pt-6">
        <h1 className="text-4xl tracking-title">Send “How was your week?”</h1>
        <AudiencePicker
          value={audience}
          onValueChange={setAudience}
          problem={empty ? "Choose who to send it to." : undefined}
          known={known}
          workspaceSize={WORKSPACE}
          search={search}
          onSummaryChange={setSummary}
        />
        <WhenPicker
          now={now}
          value={fields}
          onValueChange={(when) => setFields({ ...fields, ...when })}
          reach={reach}
          zones={zones}
        />
        <SendSettings
          now={now}
          value={fields}
          onValueChange={setFields}
          reach={reach}
          zones={zones}
          tagSuggestions={["weekly", "design"]}
          search={search}
        />
        <SendBar
          tone={empty ? "danger" : "neutral"}
          description={empty ? null : bar.description}
          secondary={
            <SlackPreview
              holler={pulse}
              sender="Mira"
              recipient="Jonas"
              closesAt={closeTime(fields, window)}
              sendsAt={fields.sendAt}
              variant="ghost"
            />
          }
          action={
            <SendButton
              disabled={empty}
              onSend={() => {}}
              send={{
                title: "How was your week?",
                reach,
                chosen: summary?.chosen ?? [],
                when: fields.sendAt ? dayTime(fields.sendAt) : "now",
                scheduled: Boolean(fields.sendAt),
              }}
            >
              {sendActionLabel(reach, Boolean(fields.sendAt))}
            </SendButton>
          }
        >
          {empty ? "Choose who to send it to." : bar.title}
        </SendBar>
      </div>
    </div>
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
  lede: "The page that sends a Holler: who gets it, what they see in Slack, and the bar that sends it. When it goes out and what happens next have their own page.",
  entries: [
    {
      slug: "audience-picker",
      name: "AudiencePicker",
      source: "components/editor/send/audience-picker.tsx",
      note: "One field, like Slack's To line: chips for who is in, then a place to type. Typing lists matches at once, best first: a name that starts with it, then people this sender sends to often. @ searches handles and # channels. Up and Down move, Enter, Tab or a comma adds, Backspace on an empty field reaches the last chip and a second Backspace removes it, with Undo. A pasted list adds every name, handle and email it can match. Here the list sits in the page; in the editor it floats under the field.",
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
              label: "Everyone",
              render: () => <PickerDemo start={{ people: [], groups: [], everyone: true }} />,
            },
            {
              label: "Many chips",
              note: "The field grows, then scrolls.",
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
      note: "The bar at the bottom of both editor pages. It floats at the bottom of the window as a plate with a shadow, and at the end of the page it settles into a plain row under a hairline. Its children say what the next press does, and the action slot holds the one plum button.",
      Demo: () => (
        <Variants
          stack
          items={[
            { label: "While writing", render: () => <ComposeBarDemo /> },
            {
              label: "While writing, with something to fix",
              render: () => <ComposeBarDemo problem="Give the second question a prompt." />,
            },
            { label: "On the sending page", render: () => <SendBarDemo /> },
            {
              label: "On the sending page, scheduled",
              render: () => <SendBarDemo start={{ sendAt: mondayNine }} />,
            },
            {
              label: "On the sending page, a big send",
              note: "Press it: more than 50 people asks once more.",
              render: () => <SendBarDemo audience={big} />,
            },
            {
              label: "On a page",
              note: "The whole sending page. Scroll inside: the bar floats, then settles.",
              render: () => <SendStageDemo />,
            },
          ]}
        />
      ),
    },
    {
      slug: "send-button",
      name: "SendButton",
      source: "components/editor/send/send-bar.tsx",
      note: "The plum button that sends. Its words name the reach. Everyone, or more than 50 people, asks once more in a dialog that says who it reaches and when; a smaller send goes at once.",
      Demo: () => (
        <Variants
          items={[
            { label: "A few people", render: () => <SendButtonDemo audience={four} /> },
            {
              label: "More than 50",
              note: "Groups make the count approximate, and the dialog says so.",
              render: () => <SendButtonDemo audience={big} />,
            },
            {
              label: "A channel of unknown size",
              note: "Holler cannot tell how many it reaches, so it asks.",
              render: () => (
                <SendButtonDemo
                  audience={{ people: ["U0JB"], groups: ["C0NEW"], everyone: false }}
                />
              ),
            },
            {
              label: "Everyone, scheduled",
              render: () => <SendButtonDemo audience={everyone} start={{ sendAt: mondayNine }} />,
            },
          ]}
        />
      ),
    },
  ],
};
