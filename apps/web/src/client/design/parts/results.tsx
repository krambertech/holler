import type { ReportOut, RoundsOut, SharingOut } from "@holler/core";
import { useState } from "react";
import { HollerActions } from "@/components/results/holler-actions";
import { HollerPeople } from "@/components/results/holler-people";
import { HollerRounds } from "@/components/results/holler-rounds";
import { QuestionResult } from "@/components/results/question-result";
import { ReportView } from "@/components/results/report-view";
import { ShareDialog } from "@/components/results/share-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Variants } from "../frame";
import {
  NOW,
  inHours,
  named,
  anonymous,
  cooling,
  lookup,
  scale,
  plain,
  number,
  multi,
  binary,
  person,
  text,
  unanswered,
} from "./results-fixtures";
import type { Group } from "./types";

const note = () => toast.add({ title: "The page calls the API here" });

const sharing: SharingOut = {
  visibility: "private",
  viewers: [
    {
      slackUserId: "U0JW",
      name: "Jun Watanabe",
      avatarUrl: null,
      member: true,
      addedAt: inHours(-2),
    },
    {
      slackUserId: "U0KO",
      name: "Kofi Owusu",
      avatarUrl: null,
      member: false,
      addedAt: inHours(-1),
    },
  ],
  reportUrl: "https://app.holler.team/report/kq3Xw0fJ2nB8yVt5LmR1cZp7HdE4sUaGoN6iTe9QvYx",
};

function ShareDemo({ start }: { start: SharingOut }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(start);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Share
      </Button>
      <ShareDialog
        open={open}
        onOpenChange={setOpen}
        sharing={state}
        canMakeLink
        candidates={named.recipients.map((r) => ({
          slackUserId: r.slackUserId,
          name: r.name,
          avatarUrl: null,
        }))}
        onSearch={() => {}}
        onVisibility={(visibility) => setState({ ...state, visibility })}
        onAdd={note}
        onRemove={(id) =>
          setState({ ...state, viewers: state.viewers.filter((v) => v.slackUserId !== id) })
        }
        onMakeLink={() => setState({ ...state, reportUrl: sharing.reportUrl })}
        onTurnOffLink={() => setState({ ...state, reportUrl: null })}
      />
    </>
  );
}

const report: ReportOut = {
  title: "How was your week?",
  mode: "pulse",
  anonymous: false,
  status: "closed",
  workspaceName: "Northwind",
  sentAt: inHours(-72),
  closedAt: inHours(-1),
  recipientCount: 6,
  answeredCount: 3,
  results: { state: "open", responseCount: 3, questions: [scale, text] },
};

const DAY = 24 * 3600_000;
const weeksAgo = (n: number) => new Date(NOW.getTime() - n * 7 * DAY).toISOString();
const round = (id: string, sendAt: string, answered: number, average: number | null) => ({
  id,
  status: "closed" as const,
  sendAt,
  recipientCount: 12,
  responseCount: answered,
  gated: false,
  scores: [{ position: 0, prompt: "How was your week?", average, top: 5 }],
});
const weekly: RoundsOut = {
  repeat: "week",
  rounds: [
    {
      ...round("r5", new Date(NOW.getTime() + 6 * DAY).toISOString(), 0, null),
      status: "scheduled",
      recipientCount: 0,
      scores: [],
    },
    { ...round("r4", weeksAgo(0), 7, 3.9), status: "live" },
    round("r3", weeksAgo(1), 11, 3.4),
    round("r2", weeksAgo(2), 10, 2.8),
    round("r1", weeksAgo(3), 12, 3.1),
  ],
};
const stoppedAnonymous: RoundsOut = {
  repeat: null,
  rounds: [
    { ...round("a2", weeksAgo(0), 3, null), status: "live", gated: true, scores: [] },
    round("a1", weeksAgo(2), 9, 4.2),
  ],
};

export const results: Group = {
  slug: "results",
  title: "Results",
  lede: "A Holler's page: who answered, when Holler reminds the rest, the results per question, and getting them out. Chasing is Holler's job, so the people still to answer come first and the strip under them always says what happens next.",
  entries: [
    {
      slug: "holler-rounds",
      name: "HollerRounds",
      source: "components/results/holler-rounds.tsx",
      note: "Every round of a repeating pulse, newest first, so the rounds read side by side. Its creator gets Edit next round and a menu that repeats it every week or every fortnight, or stops it after asking once. Each bar is the round's average on its first scale question. The round on screen is tinted and every other round opens its own page. An anonymous round under five answers shows its count only.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Weekly, with the next round",
              render: () => (
                <HollerRounds className="w-full" rounds={weekly} currentId="r4" now={NOW} />
              ),
            },
            {
              label: "Its creator, who can edit the next round and change how often it repeats",
              render: () => (
                <HollerRounds
                  className="w-full"
                  rounds={weekly}
                  currentId="r4"
                  now={NOW}
                  canEdit
                  onRepeatChange={note}
                  onStopRepeating={note}
                />
              ),
            },
            {
              label: "Stopped, anonymous",
              render: () => (
                <HollerRounds
                  className="w-full"
                  rounds={stoppedAnonymous}
                  currentId="a1"
                  now={NOW}
                />
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "holler-people",
      name: "HollerPeople",
      source: "components/results/holler-people.tsx",
      note: "The count with a few faces above a full-width bar. A live Holler lists up to five people who still need chasing (waiting, then anyone Slack would not reach, then not sent yet) and folds everyone who answered into one row; a closed one names who did not answer. On an anonymous Holler nobody has a status. The strip's button is the screen's one plum button, and only the creator sees it.",
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
              label: "Closed",
              render: () => (
                <HollerPeople
                  className="w-full"
                  people={named}
                  anonymous={false}
                  live={false}
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
      note: "The head matches the editor's card: the number, the question, its type, and the count in the corner (in the type line on a phone). Every choice, scale and number draws one row per answer in chart-2, with who picked it on a named Holler. A scale leads with its average and writes its end words beside the first and last step. Notes and Other write-ins sit in a quiet panel under the bars.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Scale, named, with notes",
              render: () => (
                <QuestionResult
                  className="w-full"
                  question={scale}
                  number={1}
                  people={lookup}
                  ends={{ low: "Rough", high: "Great" }}
                />
              ),
            },
            {
              label: "Single choice, anonymous, with Other",
              render: () => (
                <QuestionResult className="w-full" question={plain} number={2} people={new Map()} />
              ),
            },
            {
              label: "Multiple choice",
              render: () => (
                <QuestionResult className="w-full" question={multi} number={3} people={lookup} />
              ),
            },
            {
              label: "Yes or no",
              render: () => (
                <QuestionResult className="w-full" question={binary} number={4} people={lookup} />
              ),
            },
            {
              label: "Number",
              render: () => (
                <QuestionResult className="w-full" question={number} number={5} people={lookup} />
              ),
            },
            {
              label: "Person",
              render: () => (
                <QuestionResult className="w-full" question={person} number={6} people={lookup} />
              ),
            },
            {
              label: "Free text",
              render: () => (
                <QuestionResult className="w-full" question={text} number={7} people={lookup} />
              ),
            },
            {
              label: "No answers yet",
              render: () => (
                <QuestionResult
                  className="w-full"
                  question={unanswered}
                  number={8}
                  people={lookup}
                />
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
      note: "Export for anyone who can see the Holler; Duplicate and Close now for its creator. Close asks once. Export is locked while an anonymous Holler's results are still closed.",
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
    {
      slug: "share-dialog",
      name: "ShareDialog",
      source: "components/results/share-dialog.tsx",
      note: "Only the creator shares. Who sees the results, the people added by name, and the report link, in one dialog. Someone added before they ever signed in to Holler sees it once they do.",
      Demo: () => (
        <Variants
          items={[
            { label: "Shared with two people", render: () => <ShareDemo start={sharing} /> },
            {
              label: "Not shared yet",
              render: () => (
                <ShareDemo start={{ visibility: "private", viewers: [], reportUrl: null }} />
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "report-view",
      name: "ReportView",
      source: "components/results/report-view.tsx",
      note: "The page a report link opens, for anyone. It names no one: no avatars beside choices and no names beside written answers, and an anonymous Holler keeps its results closed under five answers here too.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "A closed pulse",
              render: () => <ReportView report={report} className="px-0 sm:px-0 lg:px-0" />,
            },
          ]}
        />
      ),
    },
  ],
};
