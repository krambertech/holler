import type { HollerDraft } from "@holler/core";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import type { DirectoryGroup, DirectoryPerson } from "@/components/editor/send/directory";
import { type BigSend, SendBar, SendButton } from "@/components/editor/send/send-bar";
import {
  audienceReach,
  composeBarSummary,
  dayTime,
  type SendFields,
  sendActionLabel,
  sendBarSummary,
} from "@/components/editor/send/send-logic";
import { Button } from "@/components/ui/button";
import { Variants } from "../frame";
import type { Group } from "./types";

// ─── A pretend workspace ─────────────────────────────────────────────────────────────────────

const person = (slackUserId: string, name: string, timeZone: string | null): DirectoryPerson => ({
  slackUserId,
  name,
  displayName: null,
  avatarUrl: null,
  timeZone,
});

const team: DirectoryPerson[] = [
  person("U0JB", "Jonas Berg", "Europe/Berlin"),
  person("U0AT", "Ana Torres", "Europe/Lisbon"),
  person("U0KL", "Kai Liu", "Asia/Singapore"),
  person("U0MK", "Marta Kowalska", "Europe/Warsaw"),
  person("U0JW", "Jun Watanabe", "Asia/Tokyo"),
  person("U0AM", "Amara Thompson", "America/New_York"),
  person("U0TR", "Tomás Ruiz", "America/Mexico_City"),
  person("U0PS", "Priya Shah", "Asia/Kolkata"),
  person("U0SN", "Sofia Nieminen", "Europe/Helsinki"),
  person("U0KO", "Kofi Owusu", null),
];

const groups: DirectoryGroup[] = [
  {
    slackId: "S0DES",
    kind: "usergroup",
    name: "Design team",
    handle: "design-team",
    memberCount: 11,
  },
  { slackId: "S0ENG", kind: "usergroup", name: "Engineering", handle: "eng", memberCount: 64 },
  { slackId: "C0GEN", kind: "channel", name: "general", handle: null, memberCount: 186 },
  { slackId: "C0LDS", kind: "channel", name: "leads", handle: null, memberCount: 9 },
  { slackId: "C0ANN", kind: "channel", name: "announcements", handle: null, memberCount: 214 },
];

const WORKSPACE = 214;

const sizeOf = (id: string) => groups.find((g) => g.slackId === id)?.memberCount;

type Audience = HollerDraft["audience"];
const four: Audience = { people: ["U0JB", "U0AT", "U0KL", "U0MK"], groups: [], everyone: false };
const big: Audience = { people: ["U0JB", "U0AT"], groups: ["S0ENG", "C0GEN"], everyone: false };
const everyone: Audience = { people: [], groups: [], everyone: true };

// ─── Dates that stay true whenever the page is opened ────────────────────────────────────────

function nextMonday(hour: number) {
  const at = new Date();
  at.setDate(at.getDate() + ((8 - at.getDay()) % 7 || 7));
  at.setHours(hour, 0, 0, 0);
  return at;
}
const mondayNine = nextMonday(9);

const defaults: SendFields = {
  sendAt: null,
  sendInRecipientTimeZone: false,
  closesAt: null,
  closeAfterHours: 72,
  anonymous: false,
  remindersEnabled: true,
  announceChannelId: null,
  tags: [],
};

// ─── Demos ───────────────────────────────────────────────────────────────────────────────────

/** The send a press would make, as the editor shell builds it from the draft. */
function sendFor(audience: Audience, fields: SendFields): BigSend {
  const chosen = [
    ...audience.groups.map((id) => {
      const group = groups.find((g) => g.slackId === id) as DirectoryGroup;
      return { kind: "group" as const, id, group };
    }),
    ...audience.people.map((id) => {
      const p = team.find((t) => t.slackUserId === id) as DirectoryPerson;
      return { kind: "person" as const, id, person: p };
    }),
  ];
  return {
    title: "How was your week?",
    reach: audienceReach(audience, sizeOf, WORKSPACE),
    chosen,
    when: fields.sendAt ? dayTime(fields.sendAt) : "now",
    scheduled: Boolean(fields.sendAt),
  };
}

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
        <Button variant="ghost">
          <ArrowLeft aria-hidden />
          Compose
        </Button>
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

export const sending: Group = {
  slug: "sending",
  title: "Sending",
  lede: "The Send stage of the editor: who it goes to, when and how, what they see in Slack, and the bar that sends it. Each part reads as plain facts until you change one.",
  entries: [
    {
      slug: "send-bar",
      name: "SendBar",
      source: "components/editor/send/send-bar.tsx",
      note: "The bar at the bottom of Compose and Send. It rides at the bottom of the window and settles at the end of the page, with a shadow only while it floats. Its children say what the next press does, and the action slot holds the one plum button.",
      Demo: () => (
        <Variants
          stack
          items={[
            { label: "On Compose", render: () => <ComposeBarDemo /> },
            {
              label: "On Compose, with something to fix",
              render: () => <ComposeBarDemo problem="Give the second question a prompt." />,
            },
            { label: "On Send", render: () => <SendBarDemo /> },
            {
              label: "On Send, scheduled",
              render: () => <SendBarDemo start={{ sendAt: mondayNine }} />,
            },
            {
              label: "On Send, a big send",
              note: "Press it: more than 50 people asks once more.",
              render: () => <SendBarDemo audience={big} />,
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
              label: "Everyone, scheduled",
              render: () => <SendButtonDemo audience={everyone} start={{ sendAt: mondayNine }} />,
            },
          ]}
        />
      ),
    },
  ],
};
