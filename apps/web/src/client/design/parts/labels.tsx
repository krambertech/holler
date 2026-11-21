import { ModeGlyph } from "@/components/mode-glyph";
import { Chip, StatusChip, StatusDot } from "@/components/ui/chip";
import { Variants } from "../frame";
import type { Group } from "./types";

export const labels: Group = {
  slug: "labels",
  title: "Labels",
  lede: "Pills for counts, tags and status, and the mode glyph that opens every row. A status always shows its word.",
  entries: [
    {
      slug: "chip",
      name: "Chip",
      source: "components/ui/chip.tsx",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Tint",
              note: "A count, a mode, a send time.",
              render: () => (
                <>
                  <Chip variant="tint">Pulse</Chip>
                  <Chip variant="tint">Mon 09:00</Chip>
                </>
              ),
            },
            {
              label: "Quiet",
              note: "A tag.",
              render: () => (
                <>
                  <Chip>weekly</Chip>
                  <Chip>retro</Chip>
                </>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "status",
      name: "StatusChip, StatusDot",
      source: "components/ui/chip.tsx",
      note: "Live is pink: it is out and calling right now. Scheduled, draft and closed all use the quiet closed tone. Danger is only for something that failed.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Chips",
              render: () => (
                <>
                  <StatusChip status="live">Live</StatusChip>
                  <StatusChip status="answered">Answered</StatusChip>
                  <StatusChip status="waiting">Waiting</StatusChip>
                  <StatusChip status="away">Away</StatusChip>
                  <StatusChip status="closed">Closed</StatusChip>
                  <StatusChip status="danger">Failed to send</StatusChip>
                </>
              ),
            },
            {
              label: "Dot with a word",
              note: "For tight places like a group heading.",
              render: () => (
                <span className="flex items-center gap-2 text-lg">
                  <StatusDot status="live" className="size-2" />
                  Live <span className="text-muted text-sm">3</span>
                </span>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "mode-glyph",
      name: "ModeGlyph",
      source: "components/mode-glyph.tsx",
      note: "Pulse, survey and form chase. Tinted while live, quiet otherwise. It names its mode for screen readers.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Live",
              render: () => (
                <>
                  <ModeGlyph mode="pulse" />
                  <ModeGlyph mode="survey" />
                  <ModeGlyph mode="chase" />
                </>
              ),
            },
            {
              label: "Quiet",
              render: () => (
                <>
                  <ModeGlyph mode="pulse" quiet />
                  <ModeGlyph mode="survey" quiet />
                  <ModeGlyph mode="chase" quiet />
                </>
              ),
            },
          ]}
        />
      ),
    },
  ],
};
