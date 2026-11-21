import { Download, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Variants } from "../frame";
import type { Group } from "./types";

export const actions: Group = {
  slug: "actions",
  title: "Actions",
  lede: "Three variants and four sizes, nothing else. One plum button per screen. Buttons press down 2%; nothing lifts.",
  entries: [
    {
      slug: "button",
      name: "Button",
      source: "components/ui/button.tsx",
      note: "Medium (40 px) is the default; small (32 px) sits inside rows and toolbars. On touch screens every size keeps a 44 px hit area. A link that should look like a button passes itself as render.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Primary",
              note: "The one main action on a screen. Plum by day, soft pink at night.",
              render: () => (
                <Button variant="primary">
                  <Plus aria-hidden strokeWidth={2} />
                  New holler
                </Button>
              ),
            },
            {
              label: "Secondary",
              note: "Every other action. White with a hairline that firms under the pointer.",
              render: () => (
                <Button>
                  <Download aria-hidden strokeWidth={2} />
                  Export
                </Button>
              ),
            },
            {
              label: "Ghost",
              note: "Only a way out, like Cancel. No plate until hovered.",
              render: () => <Button variant="ghost">Cancel</Button>,
            },
            {
              label: "Icon",
              note: 'size="icon" or "icon-sm". Square, with an aria-label, and a tooltip that repeats it.',
              render: () => (
                <>
                  <Button size="icon" aria-label="More actions">
                    <MoreHorizontal aria-hidden strokeWidth={2} />
                  </Button>
                  <Button size="icon-sm" aria-label="More actions">
                    <MoreHorizontal aria-hidden strokeWidth={2} />
                  </Button>
                </>
              ),
            },
            {
              label: "Pending",
              note: "Keeps its width, stays focusable, and no further press reaches onClick, from mouse or keyboard.",
              render: () => (
                <Button variant="primary" pending>
                  Sending
                </Button>
              ),
            },
            {
              label: "As a link",
              note: 'render={<a href="…" />} or a router Link. Never a styled anchor beside a button.',
              render: () => <Button render={<a href="#actions" />}>Open the report</Button>,
            },
            {
              label: "Small",
              render: () => (
                <>
                  <Button size="sm">Rename</Button>
                  <Button size="sm" variant="primary">
                    Send
                  </Button>
                </>
              ),
            },
            {
              label: "Disabled",
              note: "Only when the reason is on screen beside it.",
              render: () => <Button disabled>Export</Button>,
            },
          ]}
        />
      ),
    },
  ],
};
