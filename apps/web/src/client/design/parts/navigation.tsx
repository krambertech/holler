import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { Variants } from "../frame";
import type { Group } from "./types";

function SegmentedDemo() {
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  return (
    <Segmented aria-label="Whose hollers" value={tab} onValueChange={setTab}>
      <SegmentedItem value="mine" count={6}>
        Mine
      </SegmentedItem>
      <SegmentedItem value="shared" count={2}>
        Shared with me
      </SegmentedItem>
    </Segmented>
  );
}

export const navigation: Group = {
  slug: "navigation",
  title: "Navigation",
  lede: "Holler is one column with a slim header and no sidebar. Views switch with a segmented control; arrows move between tabs.",
  entries: [
    {
      slug: "app-header",
      name: "AppHeader",
      source: "components/app-header.tsx",
      note: "The logo goes home; the member sits on the right and opens Settings and Sign out. Nothing else lives up here.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Signed in",
              render: () => (
                <div className="w-full">
                  <AppHeader
                    me={{ name: "Mira", slackUserId: "U0LEAD", avatarUrl: null }}
                    workspaceName="Northwind"
                    onSignOut={() => toast.add({ title: "The app signs out here" })}
                  />
                </div>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "segmented",
      name: "Segmented",
      source: "components/ui/segmented.tsx",
      note: "Two or three views of one list. The chosen one is a white plate on the track.",
      Demo: () => (
        <Variants items={[{ label: "Two tabs with counts", render: () => <SegmentedDemo /> }]} />
      ),
    },
  ],
};
