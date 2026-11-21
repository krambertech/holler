import type { RespondGiven, RespondPerson, RespondQuestion } from "@holler/core";
import { Check, Link2Off, Lock } from "lucide-react";
import { useState } from "react";
import { AnswerQuestion } from "@/components/respond/answer-question";
import { RespondState } from "@/components/respond/respond-state";
import { YourAnswers } from "@/components/respond/your-answers";
import { Plate } from "@/components/ui/plate";
import { type DraftAnswer, emptyAnswer } from "@/lib/respond";
import { Variants } from "../frame";
import type { Group } from "./types";

const about = {
  title: "Offsite planning",
  senderName: "Mira Novak",
  senderSlackUserId: "U0LEAD",
  senderAvatarUrl: null,
};

const given: RespondGiven[] = [
  {
    questionId: "q1",
    prompt: "Where would you rather go?",
    picks: ["Tallinn"],
    note: "The sauna, and it is close for most of us.",
  },
  {
    questionId: "q2",
    prompt: "Which weeks work for you?",
    picks: ["8 March", "22 March"],
    note: null,
  },
  { questionId: "q3", prompt: "How many nights can you stay?", picks: ["3"], note: null },
  { questionId: "q4", prompt: "Anything else we should know?", picks: [], note: null },
];

const base: Omit<RespondQuestion, "id" | "type" | "prompt" | "options"> = {
  style: "plain",
  description: "",
  required: true,
  maxChoices: null,
  followUp: null,
  lowLabel: null,
  highLabel: null,
  numberMin: null,
  numberMax: null,
};

const options = (labels: string[], other = false) => [
  ...labels.map((label, position) => ({ id: `o${position}`, position, label, isOther: false })),
  ...(other ? [{ id: "other", position: labels.length, label: "Other", isOther: true }] : []),
];

const examples: { label: string; note?: string; question: RespondQuestion }[] = [
  {
    label: "Single choice, with Other and a follow-up after some answers",
    note: "Pick Tallinn or Other: the note opens under the answer. Other opens its own box and takes focus.",
    question: {
      ...base,
      id: "where",
      type: "single",
      prompt: "Where would you rather go?",
      options: options(["Lisbon", "Tallinn", "Riga"], true),
      followUp: { prompt: "What makes it the right place?", onlyAfter: [1, 3] },
    },
  },
  {
    label: "Multiple choice with a pick limit",
    note: "At the limit the rest wait until one is unticked; the hint says why.",
    question: {
      ...base,
      id: "weeks",
      type: "multi",
      prompt: "Which weeks work for you?",
      description: "All in spring 2027.",
      options: options(["8 March", "15 March", "22 March", "29 March"]),
      maxChoices: 2,
    },
  },
  {
    label: "Numbered scale",
    note: "One row of numbers, the words for each end under them.",
    question: {
      ...base,
      id: "tired",
      type: "single",
      style: "scale",
      prompt: "How tired are you of offsites?",
      options: options(["1", "2", "3", "4", "5"]),
      lowLabel: "Not at all",
      highLabel: "Very",
    },
  },
  {
    label: "Yes or no",
    question: {
      ...base,
      id: "fly",
      type: "single",
      style: "binary",
      prompt: "Will you fly?",
      options: options(["Yes", "No"]),
    },
  },
  {
    label: "A long list, searched",
    note: "Past 12 options the list becomes a search.",
    question: {
      ...base,
      id: "city",
      type: "single",
      prompt: "Which office are you in?",
      options: options(
        Array.from({ length: 30 }, (_, i) => `Office ${i + 1}`),
        true,
      ),
    },
  },
  {
    label: "Number",
    question: {
      ...base,
      id: "nights",
      type: "number",
      prompt: "How many nights can you stay?",
      options: [],
      numberMin: 1,
      numberMax: 7,
    },
  },
  {
    label: "Person",
    note: "A search over the workspace's Slack directory.",
    question: {
      ...base,
      id: "who",
      type: "person",
      prompt: "Who should plan it?",
      options: [],
      maxChoices: 2,
    },
  },
  {
    label: "Free text, optional",
    question: {
      ...base,
      id: "else",
      type: "text",
      prompt: "Anything else we should know?",
      required: false,
      options: [],
    },
  },
];

const weeks = examples[1]?.question as RespondQuestion;

const team: RespondPerson[] = ["Mira Kask", "Tom Okafor", "Marta Kowalska", "Jun Watanabe"].map(
  (name, i) => ({ slackUserId: `U${i}`, name, avatarUrl: null }),
);

const searchPeople = async (query: string) =>
  team.filter((p) => p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

function Demo({ question, error }: { question: RespondQuestion; error?: string | undefined }) {
  const [value, setValue] = useState<DraftAnswer>(emptyAnswer);
  return (
    <Plate className="w-full max-w-xl px-6 py-6">
      <AnswerQuestion
        question={question}
        value={value}
        onValueChange={setValue}
        error={error}
        searchPeople={searchPeople}
      />
    </Plate>
  );
}

export const answering: Group = {
  slug: "answering",
  title: "Answering",
  lede: "The web form at /respond, for a Holler Slack cannot show. One plate per question, drawn for its type, with the same rules and words as the server. The person answering has no account and never sees the app.",
  entries: [
    {
      slug: "answer-question",
      name: "AnswerQuestion",
      source: "components/respond/answer-question.tsx",
      note: "One question on the web form. Errors arrive on send, beside the question, in the words recordResponse uses.",
      Demo: () => (
        <Variants
          stack
          items={[
            ...examples.map((example) => ({
              label: example.label,
              note: example.note,
              render: () => <Demo question={example.question} />,
            })),
            {
              label: "Needs an answer",
              render: () => <Demo question={weeks} error="This question needs an answer." />,
            },
          ]}
        />
      ),
    },
    {
      slug: "respond-state",
      name: "RespondState",
      source: "components/respond/respond-state.tsx",
      note: "When there is nothing to answer: after sending, after the close, or with a link that does not work. A glyph in the state's colour, one sentence of what happened, and the Holler it is about.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Thank-you, with your answers",
              render: () => (
                <RespondState
                  className="w-full max-w-xl"
                  tone="answered"
                  icon={<Check strokeWidth={2} />}
                  title="Thank you, your answers are in"
                  holler={about}
                  description={
                    <>
                      <p>Mira sees them with everyone else's.</p>
                      <p>You can close this page.</p>
                    </>
                  }
                >
                  <YourAnswers given={given} />
                </RespondState>
              ),
            },
            {
              label: "Closed",
              render: () => (
                <RespondState
                  className="w-full max-w-xl"
                  tone="closed"
                  icon={<Lock strokeWidth={2} />}
                  title="This Holler is closed"
                  holler={about}
                  description="It closed on Friday at 18:00, so it takes no more answers."
                />
              ),
            },
            {
              label: "A link that does not work",
              render: () => (
                <RespondState
                  className="w-full max-w-xl"
                  icon={<Link2Off strokeWidth={2} />}
                  title="This link does not work"
                  description="It may have been changed on the way. Open the Holler again from your message in Slack."
                />
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "your-answers",
      name: "YourAnswers",
      source: "components/respond/your-answers.tsx",
      note: "What someone sent, read back on the thank-you page. Never shown for an anonymous Holler, whose answers keep no name.",
      Demo: () => (
        <Plate className="w-full max-w-xl">
          <YourAnswers given={given} />
        </Plate>
      ),
    },
  ],
};
