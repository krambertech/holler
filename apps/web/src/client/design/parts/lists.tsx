import { HollerRow } from "@/components/holler-row";
import { Plate } from "@/components/ui/plate";
import { Variants } from "../frame";
import { hollers } from "../mock";
import type { Group } from "./types";

export const lists: Group = {
  slug: "lists",
  title: "Lists",
  lede: "Hollers as rows on a plate. The whole row is one link and one tab stop. Four columns on a wide screen, folded under the title on a phone.",
  entries: [
    {
      slug: "holler-row",
      name: "HollerRow",
      source: "components/holler-row.tsx",
      note: "The mode glyph goes quiet once a Holler is not live. Live rows show who answered and a bar; the count beside the bar carries the meaning.",
      Demo: () => (
        <Variants
          stack
          items={(["live", "scheduled", "closed", "draft"] as const).map((status) => ({
            label: status[0]?.toUpperCase() + status.slice(1),
            render: () => (
              <Plate className="w-full">
                <HollerRow holler={hollers[status]} />
              </Plate>
            ),
          }))}
        />
      ),
    },
  ],
};
