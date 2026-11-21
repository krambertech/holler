import { answerSurface, type HollerDraft } from "@holler/core";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { AudiencePicker, type AudienceSummary } from "@/components/editor/send/audience-picker";
import type {
  Directory,
  DirectoryGroup,
  DirectoryPerson,
  DirectorySearch,
} from "@/components/editor/send/directory";
import { type BigSend, SendBar, SendButton } from "@/components/editor/send/send-bar";
import {
  answeredInLabel,
  audienceReach,
  closeTime,
  composeBarSummary,
  dayTime,
  type Reach,
  type SendFields,
  sendActionLabel,
  sendBarSummary,
  sendWindow,
  type ZoneCount,
} from "@/components/editor/send/send-logic";
import { SendSettings, type SendSettingsRow } from "@/components/editor/send/send-settings";
import { type PreviewHoller, SlackPreview } from "@/components/editor/send/slack-preview";
import { useNow } from "@/components/editor/send/use-now";
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
  // A channel Holler has not counted yet.
  { slackId: "C0NEW", kind: "channel", name: "new-joiners", handle: null, memberCount: null },
];

const WORKSPACE = 214;

const search: DirectorySearch = async (query) => {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const q = query.trim().toLocaleLowerCase();
  const hit = (name: string) => name.toLocaleLowerCase().includes(q);
  const found: Directory = {
    people: team.filter((p) => hit(p.name)),
    groups: groups.filter((g) => hit(g.name) || hit(g.handle ?? "")),
  };
  return found;
};

const known = { people: team, groups };
const sizeOf = (id: string) => groups.find((g) => g.slackId === id)?.memberCount;
const zonesOf = (ids: string[]): ZoneCount[] => {
  const byZone = new Map<string | null, number>();
  for (const id of ids) {
    const zone = team.find((p) => p.slackUserId === id)?.timeZone ?? null;
    byZone.set(zone, (byZone.get(zone) ?? 0) + 1);
  }
  return [...byZone.entries()].map(([zone, people]) => ({ zone, people }));
};

type Audience = HollerDraft["audience"];
const none: Audience = { people: [], groups: [], everyone: false };
const four: Audience = { people: ["U0JB", "U0AT", "U0KL", "U0MK"], groups: [], everyone: false };
const three: Audience = { people: ["U0JB", "U0AT", "U0KL"], groups: [], everyone: false };
const spread: Audience = {
  people: ["U0JB", "U0AT", "U0KL", "U0JW", "U0AM", "U0TR", "U0PS", "U0KO"],
  groups: [],
  everyone: false,
};
const big: Audience = { people: ["U0JB", "U0AT"], groups: ["S0ENG", "C0GEN"], everyone: false };
const everyone: Audience = { people: [], groups: [], everyone: true };

// ─── Dates that stay true whenever the page is opened ────────────────────────────────────────

function nextMonday(hour: number) {
  const at = new Date();
  at.setDate(at.getDate() + ((8 - at.getDay()) % 7 || 7));
  at.setHours(hour, 0, 0, 0);
  return at;
}
const DAY = 24 * 3600_000;
const mondayNine = nextMonday(9);
const fridayFive = new Date(nextMonday(17).getTime() + 4 * DAY);
const yesterdayFive = (() => {
  const at = new Date(Date.now() - DAY);
  at.setHours(17, 0, 0, 0);
  return at;
})();

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

const option = (label: string) => ({ label });
const pulse: PreviewHoller = {
  mode: "pulse",
  title: "",
  anonymous: false,
  questions: [
    {
      type: "single",
      style: "plain",
      prompt: "How was your week?",
      options: ["Great", "Fine", "Rough"].map(option),
    },
  ],
};
const pulseWithNote: PreviewHoller = {
  ...pulse,
  questions: [
    {
      type: "single",
      style: "plain",
      prompt: "How was your week?",
      options: ["Great", "Fine", "Rough"].map(option),
      followUp: { prompt: "Anything behind that?", onlyAfter: null },
    },
  ],
};
const textPulse: PreviewHoller = {
  mode: "pulse",
  title: "",
  anonymous: true,
  questions: [{ type: "text", style: "plain", prompt: "What should we stop doing?", options: [] }],
};
const survey: PreviewHoller = {
  mode: "survey",
  title: "Q4 retro",
  description: "Ten minutes, before Thursday's retro.",
  anonymous: false,
  questions: [
    {
      type: "single",
      style: "scale",
      prompt: "How did the quarter feel?",
      options: ["1", "2", "3", "4", "5"].map(option),
      lowLabel: "Rough",
      highLabel: "Great",
    },
    {
      type: "multi",
      style: "plain",
      prompt: "What slowed us down?",
      options: ["Meetings", "Unclear priorities", "Reviews", "On-call"].map(option),
      allowOther: true,
      maxChoices: 2,
    },
    { type: "text", style: "plain", prompt: "One thing to change next quarter", options: [] },
  ],
};
const web: PreviewHoller = {
  ...survey,
  title: "Offsite planning",
  description: "",
  questions: [
    {
      type: "single",
      style: "plain",
      prompt: "Can you make the offsite?",
      options: ["Yes", "Maybe", "No"].map(option),
      followUp: { prompt: "What would make it work?", onlyAfter: [1, 2] },
    },
    {
      type: "person",
      style: "plain",
      prompt: "Who should you room with?",
      options: [],
      maxChoices: 1,
    },
  ],
};
const chase: PreviewHoller = {
  mode: "chase",
  title: "Fill in the benefits enrolment form",
  description: "It takes five minutes, and enrolment closes Friday.",
  anonymous: false,
  questions: [],
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

/** Who, with the send refused while nobody is chosen: the editor shell owns the value. */
function RefusedPickerDemo() {
  const [value, setValue] = useState(none);
  const empty = !value.everyone && value.people.length === 0 && value.groups.length === 0;
  return (
    <AudiencePicker
      className="w-full"
      value={value}
      onValueChange={setValue}
      problem={empty ? "Choose who to send it to." : undefined}
      known={known}
      workspaceSize={WORKSPACE}
      search={search}
    />
  );
}

/** The picker keeping its own value. */
function PickerDemo({ start }: { start: Audience }) {
  return (
    <AudiencePicker
      className="w-full"
      defaultValue={start}
      known={known}
      workspaceSize={WORKSPACE}
      search={search}
    />
  );
}

/** The draft knew the design team at 9; the directory now says 11. */
function StalePickerDemo() {
  return (
    <AudiencePicker
      className="w-full"
      defaultValue={{ people: [], groups: ["S0DES"], everyone: false }}
      known={{ groups: [{ ...(groups[0] as DirectoryGroup), memberCount: 9 }] }}
      workspaceSize={WORKSPACE}
      search={search}
    />
  );
}

/** The settings keeping their own value and open row. */
function SettingsDemo({
  start,
  audience = four,
  openRow,
}: {
  start: Partial<SendFields>;
  audience?: Audience;
  openRow?: SendSettingsRow;
}) {
  return (
    <SendSettings
      className="w-full"
      defaultValue={{ ...defaults, ...start }}
      defaultOpenRow={openRow}
      reach={audienceReach(audience, sizeOf, WORKSPACE)}
      zones={zonesOf(audience.people)}
      tagSuggestions={["weekly", "design", "retro", "offsite", "hiring"]}
      knownChannels={groups.filter((g) => g.kind === "channel")}
      search={search}
    />
  );
}

/** The Send stage as the editor shell lays it out, so the bar can be seen riding and settling. */
function SendStageDemo() {
  const [audience, setAudience] = useState<Audience>(four);
  const [fields, setFields] = useState<SendFields>(defaults);
  const [openRow, setOpenRow] = useState<SendSettingsRow | null>(null);
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
      <div className="mx-auto grid max-w-[45rem] gap-7 px-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl tracking-title">How was your week?</h1>
          <SlackPreview
            holler={pulse}
            sender="Mira"
            recipient="Jonas"
            closesAt={closeTime(fields, window)}
            sendsAt={fields.sendAt}
          />
        </div>
        <AudiencePicker
          value={audience}
          onValueChange={setAudience}
          problem={empty ? "Choose who to send it to." : undefined}
          known={known}
          workspaceSize={WORKSPACE}
          search={search}
          onSummaryChange={setSummary}
        />
        <SendSettings
          now={now}
          value={fields}
          onValueChange={setFields}
          openRow={openRow}
          onOpenRowChange={setOpenRow}
          reach={reach}
          zones={zones}
          tagSuggestions={["weekly", "design"]}
          search={search}
        />
        <SendBar
          tone={empty ? "danger" : "neutral"}
          description={empty ? null : bar.description}
          secondary={
            <Button variant="ghost">
              <ArrowLeft aria-hidden />
              Compose
            </Button>
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
  lede: "The Send stage of the editor: who it goes to, when and how, what they see in Slack, and the bar that sends it. Each part reads as plain facts until you change one.",
  entries: [
    {
      slug: "audience-picker",
      name: "AudiencePicker",
      source: "components/editor/send/audience-picker.tsx",
      note: "People, user groups and channels from the Slack directory, or everyone. Chosen ones are chips with a way out; the count beside Who is approximate once groups are in, since groups overlap. Picking Everyone replaces the list, and a pick after it narrows back to that pick.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "No one yet",
              note: "The send refused: its problem sits under the plate until someone is chosen.",
              render: () => <RefusedPickerDemo />,
            },
            { label: "People only", render: () => <PickerDemo start={four} /> },
            {
              label: "Groups and people",
              render: () => (
                <PickerDemo
                  start={{ people: ["U0JB", "U0AT"], groups: ["S0DES", "C0LDS"], everyone: false }}
                />
              ),
            },
            { label: "Everyone", render: () => <PickerDemo start={everyone} /> },
            {
              label: "A size that changed",
              note: "Saved at 9 people. Open the search: the directory's newer count replaces it.",
              render: () => <StalePickerDemo />,
            },
            {
              label: "A large audience",
              render: () => (
                <PickerDemo
                  start={{
                    people: team.map((p) => p.slackUserId),
                    groups: ["S0ENG", "C0GEN"],
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
      slug: "send-settings",
      name: "SendSettings",
      source: "components/editor/send/send-settings.tsx",
      note: "One plate of facts. Change opens one row at a time; a switch row acts at once. A time that has passed or comes too early says so in its row. Give it value and onValueChange, and openRow and onOpenRowChange to open a row from outside, or leave either to the settings.",
      Demo: () => (
        <Variants
          stack
          items={[
            { label: "Send now, the defaults", render: () => <SettingsDemo start={{}} /> },
            {
              label: "Scheduled in each person's time",
              note: "Monday 09:00 on each clock. The preview says when each zone gets it on yours.",
              render: () => (
                <SettingsDemo
                  start={{ sendAt: mondayNine, sendInRecipientTimeZone: true }}
                  audience={spread}
                  openRow="send"
                />
              ),
            },
            {
              label: "Scheduled in your time",
              note: "Everyone at once; zones outside their working day are flagged.",
              render: () => (
                <SettingsDemo start={{ sendAt: mondayNine }} audience={spread} openRow="send" />
              ),
            },
            {
              label: "A fixed close date",
              render: () => <SettingsDemo start={{ closesAt: fridayFive }} openRow="close" />,
            },
            {
              label: "A close date in the past",
              render: () => <SettingsDemo start={{ closesAt: yesterdayFive }} />,
            },
            {
              label: "Anonymous, under five people",
              render: () => <SettingsDemo start={{ anonymous: true }} audience={three} />,
            },
            {
              label: "Announced, tagged, no reminders",
              render: () => (
                <SettingsDemo
                  start={{
                    announceChannelId: "C0LDS",
                    tags: ["weekly", "design"],
                    remindersEnabled: false,
                    closeAfterHours: 24,
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
            {
              label: "On a page",
              note: "The whole Send stage. Scroll inside: the bar floats, then settles.",
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
