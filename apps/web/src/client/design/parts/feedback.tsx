import { ProgressBar } from "@/components/ui/progress";
import { Variants } from "../frame";
import type { Group } from "./types";

export const feedback: Group = {
  slug: "feedback",
  title: "Progress",
  lede: "How far something has got. The number beside a bar carries the meaning; the bar is for the eye.",
  entries: [
    {
      slug: "progress",
      name: "ProgressBar",
      source: "components/ui/progress.tsx",
      note: "Decorative, so screen readers skip it and read the count instead.",
      Demo: () => (
        <Variants
          items={[0.15, 0.58, 1].map((value) => ({
            label: `${Math.round(value * 100)}%`,
            render: () => <ProgressBar value={value} className="w-56" />,
          }))}
        />
      ),
    },
  ],
};
