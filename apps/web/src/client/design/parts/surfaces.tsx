import { Button } from "@/components/ui/button";
import { Plate, PlateRow, PlateStrip, Underplate, UnderplateStrip } from "@/components/ui/plate";
import { Variants } from "../frame";
import type { Group } from "./types";

export const surfaces: Group = {
  slug: "surfaces",
  title: "Plates",
  lede: "White rounded plates on the warm canvas. Rows that belong together share one plate with a hairline between them, and a tinted strip can close it.",
  entries: [
    {
      slug: "plate",
      name: "Plate, PlateRow, PlateStrip",
      source: "components/ui/plate.tsx",
      note: "Never nest a plate in a plate. The strip says the one thing worth acting on.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Rows and a strip",
              note: "PlateRow draws the divider above every row after the first.",
              render: () => (
                <Plate className="w-full">
                  <PlateRow className="px-5 py-3.5">How was your week?</PlateRow>
                  <PlateRow className="px-5 py-3.5">Offsite: which dates work?</PlateRow>
                  <PlateStrip>
                    <span>9 people still to answer. Next reminders go out tomorrow at 10:00.</span>
                    <span>Remind now</span>
                  </PlateStrip>
                </Plate>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "underplate",
      name: "Underplate, UnderplateStrip",
      source: "components/ui/plate.tsx",
      note: "A tinted layer under a plate that shows below it, for what happens next and the action that changes it. The plate keeps its own corners and edge on top.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Under the people on a Holler",
              render: () => (
                <Underplate className="w-full">
                  <Plate>
                    <PlateRow className="px-5 py-3.5">Ben</PlateRow>
                    <PlateRow className="px-5 py-3.5">Dana</PlateRow>
                  </Plate>
                  <UnderplateStrip>
                    <span>2 people are waiting. Holler reminds them tomorrow at 10:00.</span>
                    <Button variant="primary" size="sm">
                      Send reminder
                    </Button>
                  </UnderplateStrip>
                </Underplate>
              ),
            },
          ]}
        />
      ),
    },
  ],
};
