import type { Mode, QuestionInput } from "@holler/core";
import { numberedScale } from "@holler/core";
import { useState } from "react";
import { type EditorQuestion, withKey } from "@/components/editor/questions/model";
import { QuestionCard } from "@/components/editor/questions/question-card";
import { QuestionList, ReorderGrip } from "@/components/editor/questions/question-list";
import {
  AddQuestion,
  QuestionTypeSelect,
  TypeIcon,
} from "@/components/editor/questions/question-types";
import { toast } from "@/components/ui/toast";
import { Variants } from "../frame";
import type { Group } from "./types";

const options = (...labels: string[]) => labels.map((label) => ({ label }));

const scale = (...labels: string[]) => labels.map((label, i) => ({ label, score: i + 1 }));

const weekly: QuestionInput = {
  type: "single",
  prompt: "How was your week?",
  options: options("Great", "Fine", "Rough"),
  followUp: { prompt: "Anything to add?", onlyAfter: null },
};

const focus: QuestionInput = {
  type: "text",
  prompt: "What is your one focus this week?",
  required: false,
};

const bets: QuestionInput = {
  type: "multi",
  prompt: "Which bets should we make first?",
  description: "Think about what unblocks the most people.",
  options: options("Faster onboarding", "Billing clean-up", "Mobile app"),
  allowOther: true,
  maxChoices: 2,
  followUp: { prompt: "Which platform first, and why?", onlyAfter: [2] },
};

/** One of every kind of question, the way a long survey would hold them. */
const everyType: QuestionInput[] = [
  {
    type: "single",
    prompt: "Where should the offsite be?",
    options: options("Lisbon", "Porto", "Online"),
  },
  bets,
  {
    type: "single",
    style: "binary",
    prompt: "Should we keep the Friday demo?",
    options: options("Yes", "No"),
  },
  {
    type: "single",
    style: "scale",
    prompt: "How was this sprint?",
    options: numberedScale(1, 5),
  },
  {
    type: "single",
    style: "scale",
    prompt: "I know what is expected of me this quarter.",
    options: scale("Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"),
  },
  {
    type: "single",
    style: "scale",
    prompt: "How often do you feel blocked?",
    options: scale("Never", "Rarely", "Sometimes", "Often", "Always"),
  },
  {
    type: "single",
    style: "scale",
    prompt: "How likely are you to recommend working here?",
    options: numberedScale(0, 10),
    lowLabel: "Not at all likely",
    highLabel: "Extremely likely",
  },
  { type: "text", prompt: "What should we stop doing?", required: false },
  { type: "number", prompt: "How many days off do you plan in Q1?", numberMin: 0, numberMax: 30 },
  { type: "person", prompt: "Who should lead the onboarding work?", maxChoices: 1 },
];

/** Problems as a send that failed would return them. */
const sendProblems = {
  "questions.0.prompt": "Write the question.",
  "questions.0.options.1": "Name this option, or remove it.",
  "questions.1.followUp.prompt": "Write the follow-up note, or remove it.",
  "questions.2.numberMin": "The smallest number is larger than the largest.",
};

const withProblems: QuestionInput[] = [
  { type: "single", prompt: "", options: options("Lisbon", "", "Online") },
  { ...bets, followUp: { prompt: "", onlyAfter: [2] } },
  { type: "number", prompt: "How many days off do you plan in Q1?", numberMin: 0, numberMax: 30 },
];

const keyed = (questions: QuestionInput[]) => questions.map((q, i) => withKey(q, `demo-${i}`));

/** Room on a wide screen for the grip, which sits in the margin left of each card. */
const column = "w-full max-w-[720px] lg:ps-10";

function ListDemo({
  mode: initialMode,
  initial,
  problems,
}: {
  mode: Mode;
  initial: QuestionInput[];
  problems?: Record<string, string>;
}) {
  const [mode, setMode] = useState(initialMode);
  const [questions, setQuestions] = useState<EditorQuestion[]>(() => keyed(initial));
  return (
    <div className={column}>
      <QuestionList
        mode={mode}
        questions={questions}
        onChange={setQuestions}
        problems={problems}
        onTemplates={() => toast.add({ title: "The templates dialog opens here" })}
        onMakeSurvey={() => setMode("survey")}
      />
    </div>
  );
}

function CardDemo({
  initial,
  number = 1,
  problems,
}: {
  initial: QuestionInput;
  number?: number;
  problems?: Record<string, string>;
}) {
  const [question, setQuestion] = useState(() => withKey(initial, "card"));
  return (
    <div className="w-full max-w-[720px]">
      <QuestionCard
        question={question}
        number={number}
        onChange={setQuestion}
        onDuplicate={() => toast.add({ title: "The list adds the copy under this card" })}
        onDelete={() => toast.add({ title: "The list deletes the card, with Undo" })}
        problems={problems}
      />
    </div>
  );
}

/** A drag frozen halfway: question 2 lifted over the place it is leaving. */
function DragDemo() {
  const [questions] = useState(() =>
    keyed([
      {
        type: "single",
        style: "binary",
        prompt: "Should we keep the Friday demo?",
        options: options("Yes", "No"),
      },
      { type: "text", prompt: "What should we stop doing?", required: false },
      {
        type: "single",
        style: "scale",
        prompt: "How was this sprint?",
        options: numberedScale(1, 5),
      },
    ]),
  );
  const noop = () => {};
  return (
    <ol className={`${column} flex flex-col gap-2.5`}>
      {questions.map((question, index) => {
        const lifted = index === 1;
        return (
          <li
            key={question.key}
            className="relative list-none"
            style={lifted ? { transform: "translateY(-38px)", zIndex: 1 } : undefined}
          >
            <QuestionCard
              question={question}
              number={index + 1}
              onChange={noop}
              onDelete={noop}
              lifted={lifted}
              grip={
                <ReorderGrip
                  number={index + 1}
                  describedBy=""
                  lifted={lifted}
                  folded={false}
                  disabled={false}
                  onPointerDown={noop}
                  onKeyDown={noop}
                  onBlur={noop}
                />
              }
            />
          </li>
        );
      })}
    </ol>
  );
}

function TypeSelectDemo() {
  const [value, setValue] = useState("multi");
  return (
    <QuestionTypeSelect value={value} onValueChange={setValue} aria-label="Type of question" />
  );
}

export const questions: Group = {
  slug: "questions",
  title: "Questions",
  lede: "The Compose stage of the editor: every question an open card, the way people will be asked it. Cards move by their grip, with a mouse, a finger or the keyboard.",
  entries: [
    {
      slug: "question-list",
      name: "QuestionList",
      source: "components/editor/questions/question-list.tsx",
      covers: ["FirstQuestion", "ReorderGrip"],
      note: "Drag a grip to move a card, or focus it and press Space, then the arrows, then Space again. Escape puts it back. A pulse stops at two questions and offers to become a survey.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "No questions yet",
              note: "Types first; a template is the quiet way in.",
              render: () => <ListDemo mode="survey" initial={[]} />,
            },
            {
              label: "A pulse with one question",
              render: () => <ListDemo mode="pulse" initial={[weekly]} />,
            },
            {
              label: "A pulse at its limit",
              note: "Make it a survey turns the pulse into a survey here.",
              render: () => <ListDemo mode="pulse" initial={[weekly, focus]} />,
            },
            {
              label: "A long survey, one of every type",
              render: () => <ListDemo mode="survey" initial={everyType} />,
            },
            {
              label: "Send problems",
              note: "Each field at fault has a red edge and a mark; the words gather in one line at the card's foot. Editing the field clears it.",
              render: () => (
                <ListDemo mode="survey" initial={withProblems} problems={sendProblems} />
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "question-card",
      name: "QuestionCard",
      source: "components/editor/questions/question-card.tsx",
      covers: [
        "ChoiceOptions",
        "PresetOptions",
        "ScaleOptions",
        "FollowUpEditor",
        "AnswerPreview",
        "NumberBounds",
        "PickLimit",
        "OptionMark",
        "ProblemLine",
        "ProblemFoot",
        "ProblemMark",
        "ProblemScopeProvider",
        "ScaleRange",
        "SettingLine",
        "SettingPair",
      ],
      note: "Always open. Description, Duplicate and Delete live in the menu. Settings are short sentences at the foot with small controls in them. Answers the type sets are a quiet preview. On a narrow card Required moves to the foot.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Description and a follow-up after chosen answers",
              note: "Any answer and chosen answers exclude each other. After chosen answers sends people to a web page, and the panel says so.",
              render: () => <CardDemo initial={bets} number={2} />,
            },
            {
              label: "A follow-up after any answer",
              render: () => <CardDemo initial={weekly} />,
            },
            {
              label: "Yes or no",
              note: "The type sets the answers, so they are a preview, not controls.",
              render: () => <CardDemo initial={everyType[2] as QuestionInput} number={3} />,
            },
            {
              label: "Rating",
              render: () => <CardDemo initial={everyType[3] as QuestionInput} number={4} />,
            },
            {
              label: "Custom scale",
              render: () => <CardDemo initial={everyType[6] as QuestionInput} number={7} />,
            },
            {
              label: "A new number question",
              note: "It starts at 0 or more. Change opens the two boxes in the same sentence; an empty box is no bound.",
              render: () => (
                <CardDemo
                  initial={{
                    type: "number",
                    prompt: "How many hours did you pair this week?",
                    numberMin: 0,
                  }}
                  number={9}
                />
              ),
            },
            {
              label: "Number with both bounds",
              render: () => <CardDemo initial={everyType[8] as QuestionInput} number={9} />,
            },
            {
              label: "Person",
              render: () => <CardDemo initial={everyType[9] as QuestionInput} number={10} />,
            },
            {
              label: "With problems",
              note: "One line at the foot; each field at fault has a red edge and a mark.",
              render: () => (
                <CardDemo
                  initial={{ type: "single", prompt: "", options: options("Lisbon", "", "Online") }}
                  problems={{
                    prompt: "Write the question.",
                    "options.1": "Name this option, or remove it.",
                  }}
                />
              ),
            },
            {
              label: "Number with a problem",
              render: () => (
                <CardDemo
                  initial={{
                    type: "number",
                    prompt: "How many days off do you plan in Q1?",
                    numberMin: 30,
                    numberMax: 30,
                  }}
                  number={9}
                  problems={{ numberMax: "The largest number must be more than the smallest." }}
                />
              ),
            },
            {
              label: "A drag in progress",
              note: "The lifted card floats on the plate's one shadow; the others make room.",
              render: () => <DragDemo />,
            },
          ]}
        />
      ),
    },
    {
      slug: "question-types",
      name: "QuestionTypeSelect, AddQuestion, QuestionTypeMenu, TypeIcon",
      source: "components/editor/questions/question-types.tsx",
      note: "One grouped list in one column, Choice, Scale and Write in, behind the card's type control and the Add question button. Rows are 32 px with a mouse so the list fits a laptop window. The menu marks the types new to Holler.",
      Demo: () => (
        <Variants
          items={[
            { label: "Type control", render: () => <TypeSelectDemo /> },
            {
              label: "Add question",
              render: () => (
                <div className="w-full max-w-[720px]">
                  <AddQuestion
                    onPick={(id) =>
                      toast.add({ title: `The list adds a question from the ${id} template` })
                    }
                  />
                </div>
              ),
            },
            {
              label: "Icons",
              render: () =>
                ["single", "multi", "binary", "person", "rating", "text", "number"].map((id) => (
                  <TypeIcon key={id} id={id} className="text-ink-2" />
                )),
            },
          ]}
        />
      ),
    },
  ],
};
