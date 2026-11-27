import type { QuestionResult as Result, RecipientsOut } from "@holler/core";
import type { PersonLookup } from "@/components/results/question-result";

export const NOW = new Date();
export const inHours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();

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

export const named: RecipientsOut = {
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

export const anonymous: RecipientsOut = {
  ...named,
  recipients: named.recipients.map((r) => ({ ...r, answered: null })),
};

export const cooling: RecipientsOut = { ...named, reminderAvailableAt: inHours(3) };

export const lookup = new Map<string, PersonLookup>(
  named.recipients.map((r) => [r.slackUserId, { name: r.name, avatarUrl: null }]),
);

export const scale: Result = {
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

export const plain: Result = {
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

export const number: Result = {
  id: "q3",
  prompt: "How many nights?",
  type: "number",
  style: "plain",
  answeredCount: 3,
  average: 3.7,
  median: 4,
  min: 2,
  max: 5,
  values: [
    { value: 2, slackUserId: "U0LN" },
    { value: 4, slackUserId: "U0MK" },
    { value: 5, slackUserId: "U0JW" },
  ],
};

export const multi: Result = {
  ...plain,
  id: "q5",
  prompt: "Which weeks could you travel?",
  type: "multi",
  otherTexts: [],
  options: ["10 March", "17 March", "24 March"].map((label, i) => ({
    id: `m${i}`,
    label,
    isOther: false,
    count: [3, 2, 1][i] ?? 0,
    share: ([3, 2, 1][i] ?? 0) / 3,
    slackUserIds: [["U0MK", "U0JW", "U0LN"], ["U0MK", "U0LN"], ["U0JW"]][i] ?? [],
  })),
};

export const binary: Result = {
  ...plain,
  id: "q6",
  prompt: "Can you share a room?",
  style: "binary",
  otherTexts: [],
  options: ["Yes", "No"].map((label, i) => ({
    id: `b${i}`,
    label,
    isOther: false,
    count: [2, 1][i] ?? 0,
    share: ([2, 1][i] ?? 0) / 3,
    slackUserIds: [["U0MK", "U0JW"], ["U0LN"]][i] ?? [],
  })),
};

export const person: Result = {
  id: "q7",
  prompt: "Who should plan it?",
  type: "person",
  style: "plain",
  answeredCount: 3,
  people: [
    {
      slackUserId: "U0MK",
      name: "Marta Kowalska",
      count: 2,
      share: 2 / 3,
      pickedBy: ["U0JW", "U0LN"],
    },
    { slackUserId: "U0AT", name: "Amara Thompson", count: 1, share: 1 / 3, pickedBy: ["U0MK"] },
  ],
};

export const text: Result = {
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

export const unanswered: Result = {
  id: "q8",
  prompt: "Anything in your way?",
  type: "text",
  style: "plain",
  answeredCount: 0,
  texts: [],
};
