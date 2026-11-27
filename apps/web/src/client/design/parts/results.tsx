import type { RecipientsOut, QuestionResult as Result } from "@holler/core";
import { HollerActions } from "@/components/results/holler-actions";
import { HollerPeople } from "@/components/results/holler-people";
import { type PersonLookup, QuestionResult } from "@/components/results/question-result";
import { toast } from "@/components/ui/toast";
import { Variants } from "../frame";
import type { Group } from "./types";

const NOW = new Date();
const inHours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();

const recipient = (
  slackUserId: string,
  name: string,
  answered: boolean | null,
  extra: { invited?: boolean; unreachable?: boolean } = {},
) => ({
  slackUserId,
  name,
  avatarUrl: null,
  answered,
  invited: extra.invited ?? true,
  unreachable: extra.unreachable ?? false,
});

const named: RecipientsOut = {
  recipientCount: 6,
  answeredCount: 3,
  waitingCount: 3,
  recipients: [
    recipient("U0MK", "Marta Kowalska", true),
    recipient("U0JW", "Jun Watanabe", true),
    recipient("U0LN", "Lena Novak", true),
    recipient("U0AT", "Amara Thompson", false),
    recipient("U0TR", "Tomás Ruiz", false, { unreachable: true }),
    recipient("U0KO", "Kofi Owusu", false, { invited: false }),
  ],
  nextReminderAt: inHours(20),
  reminderAvailableAt: inHours(0),
};

const anonymous: RecipientsOut = {
  ...named,
  recipients: named.recipients.map((r) => ({ ...r, answered: null })),
};

const cooling: RecipientsOut = { ...named, reminderAvailableAt: inHours(3) };

const lookup = new Map<string, PersonLookup>(
  named.recipients.map((r) => [r.slackUserId, { name: r.name, avatarUrl: null }]),
);

const scale: Result = {
  id: "q1",
  prompt: "How was your week?",
  type: "single",
  style: "scale",
  answeredCount: 3,
  average: 3.3,
  options: ["Rough", "Okay", "Good", "Great"].map((label, i) => ({
    id: `o${i}`,
    label,
    isOther: false,
    count: [0, 1, 0, 2][i] ?? 0,
    share: ([0, 1, 0, 2][i] ?? 0) / 3,
    slackUserIds: [[], ["U0LN"], [], ["U0MK", "U0JW"]][i] ?? [],
  })),
  notes: [{ text: "Shipped the pricing page.", slackUserId: "U0MK" }],
  otherTexts: [],
};

const plain: Result = {
  ...scale,
  id: "q2",
  prompt: "Where would you rather go?",
  style: "plain",
  average: null,
  notes: [],
  options: ["Lisbon", "Tallinn", "Other"].map((label, i) => ({
    id: `p${i}`,
    label,
    isOther: label === "Other",
    count: [2, 0, 1][i] ?? 0,
    share: ([2, 0, 1][i] ?? 0) / 3,
    slackUserIds: [],
  })),
  otherTexts: [{ text: "Riga, by the sea", slackUserId: null }],
};

const number: Result = {
  id: "q3",
  prompt: "How many nights?",
  type: "number",
  style: "plain",
  answeredCount: 3,
  average: 3.7,
  median: 4,
  min: 2,
  max: 5,
  values: [],
};

const text: Result = {
  id: "q4",
  prompt: "Anything in your way?",
  type: "text",
  style: "plain",
  answeredCount: 2,
  texts: [
    { text: "Waiting on the pricing copy before I can ship the page.", slackUserId: "U0MK" },
    { text: "Nothing this week.", slackUserId: "U0JW" },
  ],
};

const note = () => toast.add({ title: "The page calls the API here" });

export const results: Group = {
  slug: "results",
  title: "Results",
  lede: "A Holler's page: who answered, when Holler reminds the rest, the results per question, and getting them out. Chasing is Holler's job, so the people still to answer come first and the strip under them always says what happens next.",
  entries: [
    {
      slug: "holler-people",
      name: "HollerPeople",
      source: "components/results/holler-people.tsx",
      note: "Waiting first, then anyone Slack would not reach, then not sent yet, then answered. On an anonymous Holler nobody has a status. The strip's button is the screen's one plum button, and only the creator sees it.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Named, live",
              render: () => (
                <HollerPeople
                  className="w-full"
                  people={named}
                  anonymous={false}
                  live
                  canRemind
                  onRemind={note}
                  now={NOW}
                />
              ),
            },
            {
              label: "A reminder just went out",
              render: () => (
                <HollerPeople
                  className="w-full"
                  people={cooling}
                  anonymous={false}
                  live
                  canRemind
                  now={NOW}
                />
              ),
            },
            {
              label: "Anonymous",
              render: () => (
                <HollerPeople
                  className="w-full"
                  people={anonymous}
                  anonymous
                  live
                  canRemind={false}
                  now={NOW}
                />
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "question-result",
      name: "QuestionResult",
      source: "components/results/question-result.tsx",
      note: "Bars on the chart ramp. A scale steps from pale to deep along its options; a plain question marks its leader in chart-2. Counts and shares are always written beside the bar.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Scale, named",
              render: () => (
                <QuestionResult className="w-full" question={scale} number={1} people={lookup} />
              ),
            },
            {
              label: "Plain, with Other",
              render: () => (
                <QuestionResult className="w-full" question={plain} number={2} people={new Map()} />
              ),
            },
            {
              label: "Number",
              render: () => (
                <QuestionResult className="w-full" question={number} number={3} people={lookup} />
              ),
            },
            {
              label: "Written",
              render: () => (
                <QuestionResult className="w-full" question={text} number={4} people={lookup} />
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "holler-actions",
      name: "HollerActions",
      source: "components/results/holler-actions.tsx",
      note: "Export for anyone who can see the Holler; Copy into a new draft and Close now for its creator. Close asks once. Export is locked while an anonymous Holler's results are still closed.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Creator, live",
              render: () => (
                <HollerActions
                  hollerId="hol_design"
                  status="live"
                  isCreator
                  canExport
                  waitingCount={3}
                  onCopyAsMarkdown={note}
                  onCopyIntoDraft={note}
                  onClose={note}
                />
              ),
            },
            {
              label: "Viewer, results closed",
              render: () => (
                <HollerActions
                  hollerId="hol_design"
                  status="live"
                  isCreator={false}
                  canExport={false}
                  waitingCount={3}
                  onCopyAsMarkdown={note}
                  onCopyIntoDraft={note}
                  onClose={note}
                />
              ),
            },
          ]}
        />
      ),
    },
  ],
};
