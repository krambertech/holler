import { AlertTriangle, Info, Lock, Radio } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { UninstalledNotice } from "@/components/uninstalled-notice";
import { Variants } from "../frame";
import type { Group } from "./types";

export const states: Group = {
  slug: "states",
  title: "Empty, loading and error",
  lede: "What a screen says when it has nothing, is still loading, or failed. Each one says what is going on and the one thing to do next. None of them is ever just “nothing here”. Their drawings come from the illustration set.",
  entries: [
    {
      slug: "empty-state",
      name: "EmptyState",
      source: "components/empty-state.tsx",
      covers: ["StateLayout"],
      note: "Nothing here yet, or nothing matched. One drawing, one line of why, one way forward. The size follows the space it stands in, and the drawing comes with it.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "lg: a whole screen",
              note: "First use. The drawing teaches the screen: this is the row that will appear.",
              render: () => (
                <EmptyState
                  className="w-full"
                  size="lg"
                  illustration="hollers"
                  title="Ask your team something"
                  description="Holler sends your question to each person in Slack, reminds the ones who have not answered, and shows you the results here."
                  action={<Button variant="primary">New holler</Button>}
                />
              ),
            },
            {
              label: "md: a group inside a screen",
              note: "Settings sections, a tab with nothing in it.",
              render: () => (
                <div className="grid w-full gap-3 md:grid-cols-2">
                  <EmptyState
                    illustration="keys"
                    title="No API keys yet"
                    description="Make one to send hollers from a script or Zapier."
                    action={<Button size="sm">New API key</Button>}
                  />
                  <EmptyState
                    illustration="shared"
                    title="Nothing shared with you yet"
                    description="When someone shares a Holler's results with you or the workspace, it shows up here."
                  />
                </div>
              ),
            },
            {
              label: "dashed: nothing matched",
              note: "Temporary, so it never reads as a plate of results. The action is the way back.",
              render: () => (
                <EmptyState
                  className="w-full"
                  role="status"
                  variant="dashed"
                  illustration="search"
                  title="No holler matches “retro”"
                  description="Search looks at titles. Try a shorter word."
                  action={<Button size="sm">Clear search</Button>}
                />
              ),
            },
            {
              label: "sm: a small element",
              note: "Beside the words, not above them. bare inside a popover or a plate that is already a surface.",
              render: () => (
                <div className="grid w-full gap-3 md:grid-cols-2">
                  <div className="rounded-control bg-plate shadow-float">
                    <EmptyState
                      size="sm"
                      variant="bare"
                      illustration="people"
                      title="No one called “Sam”"
                      description="Only people in this workspace can be picked."
                    />
                  </div>
                  <EmptyState
                    size="sm"
                    illustration="results"
                    title="No answers yet"
                    description="Holler reminds people tomorrow at 10:00."
                  />
                  <EmptyState
                    size="sm"
                    illustration="scheduled"
                    title="Nothing scheduled"
                    action={<Button size="sm">Schedule one</Button>}
                  />
                  <EmptyState
                    size="sm"
                    illustration="done"
                    title="Everyone answered"
                    description="12 of 12, two days before it closes."
                  />
                </div>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "error-state",
      name: "ErrorState",
      source: "components/error-state.tsx",
      note: "Something failed. What failed, what to do, and Try again. The same sizes as EmptyState; the drawing says which kind of failure, and a reference code sits at the bottom for support.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "md: a section failed",
              note: "The rest of the page still works, so only this part says so.",
              render: () => (
                <ErrorState
                  className="w-full"
                  title="We could not load your hollers"
                  onRetry={() => {}}
                  reference="hol-7f3a9c"
                />
              ),
            },
            {
              label: "lg: Holler could not be reached",
              render: () => (
                <ErrorState
                  className="w-full"
                  size="lg"
                  illustration="offline"
                  title="Holler is not answering"
                  description="Your hollers are safe. Check your connection, then try again."
                  onRetry={() => {}}
                />
              ),
            },
            {
              label: "md: no access",
              note: "locked draws in warning: nothing broke, it is just not yours to see.",
              render: () => (
                <ErrorState
                  className="w-full"
                  illustration="locked"
                  title="This Holler is not shared with you"
                  description="Ask the person who sent it to share its results with you or the workspace."
                />
              ),
            },
            {
              label: "sm: inside a small element",
              render: () => (
                <div className="grid w-full gap-3 md:grid-cols-2">
                  <ErrorState
                    size="sm"
                    title="We could not load the plan"
                    description="Try again in a moment."
                    onRetry={() => {}}
                  />
                  <div className="rounded-control bg-plate shadow-float">
                    <ErrorState
                      size="sm"
                      variant="bare"
                      illustration="offline"
                      title="We could not load the channels"
                      description="Slack did not answer. Try again."
                      onRetry={() => {}}
                    />
                  </div>
                </div>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "notice",
      name: "Notice",
      source: "components/notice.tsx",
      note: "A short message inside a screen, with at most one action. Warning sits above the controls it limits.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Neutral",
              render: () => (
                <Notice
                  className="w-full"
                  icon={<Info />}
                  title="Anonymous answers open at 5"
                  description="Results stay closed until enough people answer that no one can be picked out."
                />
              ),
            },
            {
              label: "Warning",
              render: () => (
                <Notice
                  className="w-full"
                  tone="warning"
                  icon={<AlertTriangle />}
                  title="You have sent 5 of 5 hollers this month"
                  action={<Button size="sm">Upgrade to Team</Button>}
                  description="Drafts still save. Sending opens again on 1 December."
                />
              ),
            },
            {
              label: "Danger",
              render: () => (
                <Notice
                  className="w-full"
                  tone="danger"
                  icon={<Lock />}
                  title="Holler is not installed in this workspace"
                  description="Sending is paused until someone adds Holler to Slack again."
                />
              ),
            },
            {
              label: "Live",
              render: () => (
                <Notice
                  className="w-full"
                  tone="live"
                  icon={<Radio />}
                  title="3 hollers are live"
                  description="Holler reminds the people who have not answered, on its own schedule."
                />
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "uninstalled-notice",
      name: "UninstalledNotice",
      source: "components/uninstalled-notice.tsx",
      note: "A warning Notice at the top of every page while Holler is out of Slack. Owners get the way back; senders are told who has it.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "An owner",
              render: () => <UninstalledNotice className="w-full" canReinstall />,
            },
            {
              label: "A sender",
              render: () => <UninstalledNotice className="w-full" canReinstall={false} />,
            },
          ]}
        />
      ),
    },
    {
      slug: "skeleton",
      name: "Skeleton",
      source: "components/skeleton.tsx",
      note: "The shape of what is loading, at its loaded size, with a slow sheen. Reduced motion keeps the shape and drops the sheen.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "A row loading",
              render: () => (
                <div className="flex w-full items-center gap-3 rounded-plate bg-plate px-5 py-[13px] edge">
                  <Skeleton className="size-[38px] rounded-glyph" />
                  <span className="grid flex-1 gap-2">
                    <Skeleton className="h-3.5 w-2/5 rounded-full" />
                    <Skeleton className="h-3 w-1/4 rounded-full" />
                  </span>
                </div>
              ),
            },
          ]}
        />
      ),
    },
  ],
};
