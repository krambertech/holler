import type { OwnGiven, OwnHoller } from "@holler/core";
import { GivenAnswers } from "@/components/answers/given-answers";
import { OwnHollerRow } from "@/components/answers/own-holler-row";
import { Plate } from "@/components/ui/plate";
import { Variants } from "../frame";
import type { Group } from "./types";

const day = 24 * 60 * 60 * 1000;
const at = (offset: number) => new Date(Date.now() + offset).toISOString();

const base: OwnHoller = {
  id: "holler_design",
  mode: "pulse",
  title: "How was your week?",
  anonymous: false,
  senderName: "Mira",
  sentAt: at(-2 * day),
  closesAt: at(2 * day),
  closedAt: null,
  state: "waiting",
  answeredAt: null,
  slackUrl: "https://slack.com/app_redirect?team=T0&channel=D0",
};

const rows: { label: string; holler: OwnHoller }[] = [
  { label: "Waiting on you", holler: base },
  {
    label: "Answered",
    holler: {
      ...base,
      mode: "survey",
      title: "Offsite: which dates work?",
      state: "answered",
      answeredAt: at(-1 * day),
      slackUrl: null,
    },
  },
  {
    label: "Answered anonymously",
    holler: {
      ...base,
      mode: "survey",
      title: "Team health check",
      anonymous: true,
      state: "answered",
      answeredAt: at(-40 * day),
      closedAt: at(-38 * day),
      slackUrl: null,
    },
  },
  {
    label: "Closed before you answered",
    holler: {
      ...base,
      title: "New laptop: Mac or Framework?",
      state: "missed",
      closedAt: at(-46 * day),
      slackUrl: null,
    },
  },
];

const given: OwnGiven[] = [
  {
    questionId: "q1",
    prompt: "Which weeks could you travel?",
    type: "multi",
    picks: ["10 March", "17 March"],
    note: null,
  },
  {
    questionId: "q2",
    prompt: "Where would you rather go?",
    type: "single",
    picks: ["Lisbon"],
    note: "Direct flights from Tallinn.",
  },
  {
    questionId: "q3",
    prompt: "Anything we should plan around?",
    type: "text",
    picks: ["I am away the first week of March."],
    note: null,
  },
  { questionId: "q4", prompt: "How many nights?", type: "number", picks: ["3"], note: null },
  { questionId: "q5", prompt: "Who should plan it?", type: "person", picks: [], note: null },
];

export const answers: Group = {
  slug: "answers",
  title: "Your answers",
  lede: "What a person was sent and what they said, on their own page. Only they see it, anonymous answers included.",
  entries: [
    {
      slug: "own-holler-row",
      name: "OwnHollerRow",
      source: "components/answers/own-holler-row.tsx",
      note: "Answered rows open the person's answers. A waiting row's one action takes them back to their message in Slack; a closed one is quiet and opens nothing.",
      Demo: () => (
        <Variants
          stack
          items={rows.map(({ label, holler }) => ({
            label,
            render: () => (
              <Plate className="w-full">
                <OwnHollerRow holler={holler} />
              </Plate>
            ),
          }))}
        />
      ),
    },
    {
      slug: "given-answers",
      name: "GivenAnswers",
      source: "components/answers/given-answers.tsx",
      note: "One row per question, as the person answered it: picks as chips, words as they wrote them, a number large, and No answer for a question they skipped.",
      Demo: () => <GivenAnswers given={given} className="w-full" />,
    },
  ],
};
