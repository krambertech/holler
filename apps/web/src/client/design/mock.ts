import type { HollerSummary, SettingsMember } from "@holler/core";

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const person = (slackUserId: string, name: string, answered: boolean) => ({
  slackUserId,
  name,
  avatarUrl: null,
  answered,
});

export const people = [
  person("U0MK", "Marta Kowalska", true),
  person("U0JW", "Jun Watanabe", true),
  person("U0AT", "Amara Thompson", false),
  person("U0TR", "Tomás Ruiz", false),
];

const base = {
  anonymous: false,
  tags: [],
  sendAt: null,
  closedAt: null,
  creator: { id: "mem_design", name: "Mira Kask", avatarUrl: null },
};

export const hollers: Record<"live" | "scheduled" | "closed" | "draft", HollerSummary> = {
  live: {
    ...base,
    id: "hol_design0000live",
    mode: "pulse",
    status: "live",
    title: "How was your week?",
    questionCount: 2,
    recipientCount: 12,
    answeredCount: 7,
    sentAt: inHours(-48),
    closesAt: inHours(70),
    people,
  },
  scheduled: {
    ...base,
    id: "hol_design00sched",
    mode: "pulse",
    status: "scheduled",
    title: "Retro: what should we change?",
    anonymous: true,
    questionCount: 1,
    recipientCount: 0,
    answeredCount: 0,
    sendAt: inHours(72),
    sentAt: null,
    closesAt: null,
    people: [],
  },
  closed: {
    ...base,
    id: "hol_design0closed",
    mode: "survey",
    status: "closed",
    title: "New laptop: Mac or Framework?",
    questionCount: 2,
    recipientCount: 6,
    answeredCount: 6,
    sentAt: inHours(-480),
    closesAt: inHours(-380),
    closedAt: inHours(-380),
    people: [],
  },
  draft: {
    ...base,
    id: "hol_design00draft",
    mode: "chase",
    status: "draft",
    title: "Submit your Q4 expenses",
    questionCount: 0,
    recipientCount: 0,
    answeredCount: 0,
    sentAt: null,
    closesAt: null,
    people: [],
  },
};

export const members: SettingsMember[] = [
  {
    id: "mem_sample00000001",
    role: "owner",
    slackUserId: "U0LEAD",
    name: "Mira Kask",
    displayName: null,
    avatarUrl: null,
    joinedAt: inHours(-24 * 30),
    isYou: true,
  },
  {
    id: "mem_sample00000002",
    role: "sender",
    slackUserId: "U0JW",
    name: "Jun Watanabe",
    displayName: null,
    avatarUrl: null,
    joinedAt: inHours(-24 * 3),
    isYou: false,
  },
];
