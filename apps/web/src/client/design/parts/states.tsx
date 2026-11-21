import { AlertTriangle, Info, KeyRound, Lock, Radio, Search } from "lucide-react";
import { EmptySection, EmptyState, NoResults } from "@/components/empty-state";
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
  lede: "What a screen says when it has nothing, is still loading, or failed. Each one says what is going on and the one thing to do next. None of them is ever just “nothing here”.",
  entries: [
    {
      slug: "empty-state",
      name: "EmptyState",
      source: "components/empty-state.tsx",
      note: "A whole screen on first use. A faded example row shows what will appear, then why it is empty and the action that fills it.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "First Holler",
              render: () => (
                <div className="w-full">
                  <EmptyState
                    title="Ask your team something"
                    description="Holler sends your question to each person in Slack, reminds the ones who have not answered, and shows you the results here."
                    action={<Button variant="primary">New holler</Button>}
                  />
                </div>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "empty-section",
      name: "EmptySection",
      source: "components/empty-state.tsx",
      note: "An empty group inside a screen. Smaller, one icon, one line, one action.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "No API keys",
              render: () => (
                <EmptySection
                  className="w-full max-w-md"
                  icon={<KeyRound />}
                  title="No API keys yet"
                  description="Make one to send hollers from a script or Zapier."
                  action={<Button size="sm">New API key</Button>}
                />
              ),
            },
            {
              label: "Nothing shared",
              render: () => (
                <EmptySection
                  className="w-full max-w-md"
                  icon={<Radio />}
                  title="Nothing shared with you yet"
                  description="When someone shares a Holler's results with you or the workspace, it shows up here."
                />
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "no-results",
      name: "NoResults",
      source: "components/empty-state.tsx",
      note: "A search or filter that matched nothing. Dashed, because it is temporary. The action is the way back.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Search",
              render: () => (
                <div className="w-full">
                  <NoResults
                    icon={<Search />}
                    title="No holler matches “retro”"
                    description="Search looks at titles. Try a shorter word."
                    action={<Button size="sm">Clear search</Button>}
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
      note: "Something failed to load. What failed, what to do, and Try again. A reference code for support when there is one.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Load failed",
              render: () => (
                <div className="w-full">
                  <ErrorState
                    title="We could not load your hollers"
                    onRetry={() => {}}
                    reference="hol-7f3a9c"
                  />
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
