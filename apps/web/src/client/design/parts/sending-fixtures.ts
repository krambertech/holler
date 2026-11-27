import { foldText, type HollerDraft, parseSearch } from "@holler/core";
import { rankEntries } from "@/components/editor/send/audience-logic";
import {
  type Directory,
  type DirectoryGroup,
  type DirectoryPerson,
  type DirectoryResolve,
  type DirectorySearch,
  groupEntry,
  personEntry,
  type Resolved,
} from "@/components/editor/send/directory";
import type { BigSend } from "@/components/editor/send/send-bar";
import {
  audienceReach,
  dayTime,
  type SendFields,
  type ZoneCount,
} from "@/components/editor/send/send-logic";
import type { PreviewHoller } from "@/components/editor/send/slack-preview";

const person = (
  slackUserId: string,
  name: string,
  timeZone: string | null,
  displayName: string | null = null,
  sends = 0,
): DirectoryPerson => ({ slackUserId, name, displayName, avatarUrl: null, timeZone, sends });

export const team: DirectoryPerson[] = [
  person("U0JB", "Jonas Berg", "Europe/Berlin", "jonas", 6),
  person("U0AT", "Ana Torres", "Europe/Lisbon", "ana.t", 4),
  person("U0KL", "Kai Liu", "Asia/Singapore", "kai"),
  person("U0MK", "Marta Kowalska", "Europe/Warsaw", "marta.k", 2),
  person("U0MA", "Mateo Álvarez", "America/Bogota", "mateo"),
  person("U0MR", "Mira Rao", "Asia/Kolkata", null),
  person("U0JW", "Jun Watanabe", "Asia/Tokyo"),
  person("U0AM", "Amara Thompson", "America/New_York"),
  person("U0TR", "Tomás Ruiz", "America/Mexico_City"),
  person("U0PS", "Priya Shah", "Asia/Kolkata"),
  person("U0SN", "Sofia Nieminen", "Europe/Helsinki"),
  person("U0KO", "Kofi Owusu", null),
];

export const groups: DirectoryGroup[] = [
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

export const WORKSPACE = 214;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function lookUp(query: string): Directory {
  const found = rankEntries([...groups.map(groupEntry), ...team.map(personEntry)], query);
  return {
    people: found.flatMap((entry) => (entry.kind === "person" ? [entry.person] : [])),
    groups: found.flatMap((entry) => (entry.kind === "group" ? [entry.group] : [])),
  };
}

export const search: DirectorySearch = async (query) => {
  await wait(250);
  return lookUp(query);
};
export const syncingSearch: DirectorySearch = async (query) => {
  await wait(250);
  const found = lookUp(query);
  return { people: found.people.slice(0, 2), groups: [], syncing: true };
};
export const slowSearch: DirectorySearch = () => new Promise(() => {});
export const failingSearch: DirectorySearch = async () => {
  await wait(250);
  throw new Error("offline");
};

export const resolve: DirectoryResolve = async (terms) => {
  await wait(400);
  const missed: Resolved["missed"] = [];
  const found: Directory = { people: [], groups: [] };
  const whole = (names: (string | null)[], term: string) => {
    const words = new Set(names.flatMap((name) => (name ? foldText(name).split(" ") : [])));
    const { tokens } = parseSearch(term);
    return tokens.length > 0 && tokens.every((token) => words.has(token));
  };
  for (const term of terms) {
    const hits = lookUp(term);
    const people = hits.people.filter((p) => whole([p.name, p.displayName], term));
    const named = hits.groups.filter((g) => whole([g.name, g.handle], term));
    if (people.length + named.length !== 1) {
      missed.push({ term, reason: people.length + named.length ? "several" : "none" });
    } else {
      found.people.push(...people);
      found.groups.push(...named);
    }
  }
  return { ...found, missed };
};

export const known = { people: team, groups };
export const sizeOf = (id: string) => groups.find((g) => g.slackId === id)?.memberCount;
export const zonesOf = (ids: string[]): ZoneCount[] => {
  const byZone = new Map<string | null, number>();
  for (const id of ids) {
    const zone = team.find((p) => p.slackUserId === id)?.timeZone ?? null;
    byZone.set(zone, (byZone.get(zone) ?? 0) + 1);
  }
  return [...byZone.entries()].map(([zone, people]) => ({ zone, people }));
};

export type Audience = HollerDraft["audience"];
export const none: Audience = { people: [], groups: [], everyone: false };
export const four: Audience = {
  people: ["U0JB", "U0AT", "U0KL", "U0MK"],
  groups: [],
  everyone: false,
};
export const three: Audience = { people: ["U0JB", "U0AT", "U0KL"], groups: [], everyone: false };
export const spread: Audience = {
  people: ["U0JB", "U0AT", "U0KL", "U0JW", "U0AM", "U0TR", "U0PS", "U0KO"],
  groups: [],
  everyone: false,
};

export const big: Audience = {
  people: ["U0JB", "U0AT"],
  groups: ["S0ENG", "C0GEN"],
  everyone: false,
};
export const everyone: Audience = { people: [], groups: [], everyone: true };

function nextMonday(hour: number) {
  const at = new Date();
  at.setDate(at.getDate() + ((8 - at.getDay()) % 7 || 7));
  at.setHours(hour, 0, 0, 0);
  return at;
}
const DAY = 24 * 3600_000;
export const mondayNine = nextMonday(9);
export const fridayFive = new Date(nextMonday(17).getTime() + 4 * DAY);
export const yesterdayFive = (() => {
  const at = new Date(Date.now() - DAY);
  at.setHours(17, 0, 0, 0);
  return at;
})();

export const defaults: SendFields = {
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
export const pulse: PreviewHoller = {
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
export const pulseWithNote: PreviewHoller = {
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
export const textPulse: PreviewHoller = {
  mode: "pulse",
  title: "",
  anonymous: true,
  questions: [{ type: "text", style: "plain", prompt: "What should we stop doing?", options: [] }],
};
export const survey: PreviewHoller = {
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
export const web: PreviewHoller = {
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
export const chase: PreviewHoller = {
  mode: "chase",
  title: "Fill in the benefits enrolment form",
  description: "It takes five minutes, and enrolment closes Friday.",
  anonymous: false,
  questions: [],
};

export function sendFor(audience: Audience, fields: SendFields): BigSend {
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
