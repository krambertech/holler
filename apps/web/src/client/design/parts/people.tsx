import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Variants } from "../frame";
import { people as sample } from "../mock";
import type { Group } from "./types";

export const people: Group = {
  slug: "people",
  title: "People",
  lede: "Slack's photo when there is one, initials on a pastel picked from the Slack id when there is not. Avatars are decoration: the name or count is always said in words.",
  entries: [
    {
      slug: "avatar",
      name: "Avatar",
      source: "components/ui/avatar.tsx",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Initials",
              render: () =>
                sample.map((p) => (
                  <Avatar key={p.slackUserId} name={p.name} seed={p.slackUserId} size="lg" />
                )),
            },
            {
              label: "Waiting",
              note: "Greyed, so answered people stand out.",
              render: () => <Avatar name="Amara Thompson" seed="U0AT" waiting size="lg" />,
            },
            {
              label: "Sizes",
              render: () =>
                (["sm", "md", "lg", "xl"] as const).map((size) => (
                  <Avatar key={size} name="Mira Kask" seed="U0LEAD" size={size} />
                )),
            },
          ]}
        />
      ),
    },
    {
      slug: "avatar-stack",
      name: "AvatarStack",
      source: "components/ui/avatar.tsx",
      note: "Answered first, then waiting, then +N, at any avatar size. The stack carries one aria-label that says what it means.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Stack",
              render: () => (
                <AvatarStack people={sample} total={12} aria-label="12 people, 7 answered" />
              ),
            },
            {
              label: "Small group",
              render: () => (
                <AvatarStack people={sample.slice(0, 2)} total={2} aria-label="2 people" />
              ),
            },
          ]}
        />
      ),
    },
  ],
};
