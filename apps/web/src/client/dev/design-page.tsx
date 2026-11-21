import type { BillingOverview, HollerSummary, SettingsMember } from "@holler/core";
import { Download, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { LimitReachedMessage } from "@/components/billing/limit-reached";
import { PlanPlate } from "@/components/billing/plan-plate";
import { EmptyState } from "@/components/empty-state";
import { HollerRow } from "@/components/holler-row";
import { Logo, Mark } from "@/components/logo";
import { ModeGlyph } from "@/components/mode-glyph";
import { MemberRow } from "@/components/settings/member-row";
import { WorkspaceIcon } from "@/components/settings/workspace-icon";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip, StatusChip } from "@/components/ui/chip";
import { Plate, PlateStrip } from "@/components/ui/plate";
import { ProgressBar } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { UninstalledNotice } from "@/components/uninstalled-notice";

/**
 * Every component in every state, in both themes side by side. Local development only: the route
 * imports this file only when import.meta.env.DEV, so a production build drops it, and
 * `pnpm check:boundaries` fails if it ever ships. Add a specimen when you make a component.
 */

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

const sample: HollerSummary[] = [
  {
    id: "hol_sample00000001",
    mode: "pulse",
    status: "live",
    title: "How was your week?",
    anonymous: false,
    tags: ["weekly"],
    questionCount: 2,
    recipientCount: 12,
    answeredCount: 7,
    sendAt: null,
    sentAt: inHours(-48),
    closesAt: inHours(70),
    closedAt: null,
    creator: { id: "mem_x", name: "Mira Kask", avatarUrl: null },
    people: [
      { slackUserId: "U1", name: "Marta Kowalska", avatarUrl: null, answered: true },
      { slackUserId: "U2", name: "Jun Watanabe", avatarUrl: null, answered: true },
      { slackUserId: "U3", name: "Amara Thompson", avatarUrl: null, answered: false },
    ],
  },
  {
    id: "hol_sample00000002",
    mode: "pulse",
    status: "scheduled",
    title: "Retro: what should we change?",
    anonymous: true,
    tags: [],
    questionCount: 1,
    recipientCount: 0,
    answeredCount: 0,
    sendAt: inHours(72),
    sentAt: null,
    closesAt: null,
    closedAt: null,
    creator: { id: "mem_x", name: "Mira Kask", avatarUrl: null },
    people: [],
  },
];

const sampleMembers: SettingsMember[] = [
  {
    id: "mem_sample00000001",
    role: "owner",
    slackUserId: "U1",
    name: "Mira Kask",
    displayName: null,
    avatarUrl: null,
    joinedAt: inHours(-24 * 30),
    isYou: true,
  },
  {
    id: "mem_sample00000002",
    role: "sender",
    slackUserId: "U2",
    name: "Jun Watanabe",
    displayName: null,
    avatarUrl: null,
    joinedAt: inHours(-24 * 3),
    isYou: false,
  },
];

export default function DesignPage() {
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  return (
    <main className="mx-auto flex max-w-[1800px] flex-col gap-6 p-6">
      <h1 className="text-3xl tracking-title">Holler design system</h1>
      <p className="max-w-[70ch] text-ink-2">
        Every component in every state, day and night. Tokens live in packages/design/tokens.css;
        the rules are in DESIGN.md.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        {(["light", "dark"] as const).map((theme) => (
          <div
            key={theme}
            data-theme={theme}
            className="flex flex-col gap-8 rounded-plate bg-canvas p-6 text-ink shadow-[0_0_0_1px_var(--edge)]"
          >
            <Specimen title="Brand">
              <div className="flex items-center gap-6">
                <Logo />
                <Mark size={64} />
                <Mark size={20} />
              </div>
            </Specimen>

            <Specimen title="Type">
              <div className="flex flex-col gap-2">
                <span className="text-5xl tracking-display">Send me a Holler</span>
                <span className="text-3xl tracking-title">Your hollers</span>
                <span className="text-lg">Anything in your way?</span>
                <span className="font-normal">How was your week?</span>
                <span>Waiting on the pricing copy before I can ship the page.</span>
                <span className="font-medium">Send reminder</span>
                <span className="text-sm text-muted">Pulse · sent Monday · closes Fri 18:00</span>
              </div>
            </Specimen>

            <Specimen title="Buttons">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary">New holler</Button>
                <Button>Export</Button>
                <Button icon={<Download size={16} strokeWidth={2} />}>Download CSV</Button>
                <Button variant="ghost">Cancel</Button>
                <Button variant="icon" aria-label="More">
                  <MoreHorizontal size={18} strokeWidth={2} />
                </Button>
                <Button variant="primary" pending>
                  Sending
                </Button>
                <Button disabled>Disabled</Button>
                <Button size="sm">Small</Button>
              </div>
            </Specimen>

            <Specimen title="Chips and status">
              <div className="flex flex-wrap gap-2">
                <Chip tone="tint">Pulse</Chip>
                <Chip>weekly</Chip>
                <StatusChip status="live">Live</StatusChip>
                <StatusChip status="answered">Answered</StatusChip>
                <StatusChip status="waiting">Waiting</StatusChip>
                <StatusChip status="away">Away</StatusChip>
                <StatusChip status="closed">Closed</StatusChip>
                <StatusChip status="danger">Not sent</StatusChip>
              </div>
            </Specimen>

            <Specimen title="People">
              <div className="flex items-center gap-4">
                <Avatar name="Mira Kask" seed="U0LEAD" size={36} />
                <Avatar name="Jun Watanabe" seed="U0JW" />
                <Avatar name="Amara Thompson" seed="U0AT" waiting />
                <AvatarStack people={sample[0]?.people ?? []} total={12} label="12 people" />
              </div>
            </Specimen>

            <Specimen title="Modes">
              <div className="flex gap-2">
                <ModeGlyph mode="pulse" />
                <ModeGlyph mode="survey" />
                <ModeGlyph mode="chase" />
                <ModeGlyph mode="pulse" quiet />
              </div>
            </Specimen>

            <Specimen title="Tabs and progress">
              <div className="flex flex-col gap-4">
                <Segmented
                  label="Whose hollers"
                  value={tab}
                  onValueChange={setTab}
                  items={[
                    { value: "mine", label: "Mine", count: 6 },
                    { value: "shared", label: "Shared with me", count: 2 },
                  ]}
                />
                <ProgressBar value={0.58} className="w-40" />
              </div>
            </Specimen>

            <Specimen title="Rows on a plate">
              <Plate>
                {sample.map((h) => (
                  <HollerRow key={h.id} holler={h} />
                ))}
                <PlateStrip>
                  <span>5 people still to answer.</span>
                </PlateStrip>
              </Plate>
            </Specimen>

            <Specimen title="Empty state">
              <EmptyState
                title="Ask your team something"
                body="Holler sends your question to each person in Slack, reminds the ones who have not answered, and shows you the results here."
                action={<Button variant="primary">New holler</Button>}
              />
            </Specimen>

            <Specimen title="Settings">
              <div className="flex items-center gap-3">
                <WorkspaceIcon name="Northwind" src={null} />
                <WorkspaceIcon name="Acme Labs" src={null} size={32} />
              </div>
              <Plate>
                <MemberRow
                  member={sampleMembers[0] as SettingsMember}
                  canChangeRole
                  onRoleChange={() => {}}
                />
                <MemberRow
                  member={sampleMembers[1] as SettingsMember}
                  canChangeRole
                  onRoleChange={() => {}}
                  error="A workspace needs at least one owner. Make someone else an owner first."
                />
                <MemberRow
                  member={sampleMembers[1] as SettingsMember}
                  canChangeRole={false}
                  pending
                />
              </Plate>
              <UninstalledNotice canReinstall />
              <UninstalledNotice canReinstall={false} />
            </Specimen>

            <Specimen title="Limit reached, for an owner and for a sender">
              <LimitReachedMessage overview={limitSample} />
              <LimitReachedMessage
                overview={{ ...limitSample, canManage: false, owners: [{ name: "Mira Lind" }] }}
              />
            </Specimen>

            <Specimen title="Plan: Free at the limit, Team ending, and a sender's view">
              <PlanPlate overview={{ ...limitSample, sentThisMonth: 5 }} />
              <PlanPlate
                overview={{
                  ...limitSample,
                  plan: "team",
                  planEndsAt: "2026-12-20T10:00:00.000Z",
                  sentThisMonth: 14,
                  monthlyLimit: null,
                  hasBillingAccount: true,
                }}
              />
              <PlanPlate
                overview={{
                  ...limitSample,
                  sentThisMonth: 2,
                  canManage: false,
                  owners: [{ name: "Mira Lind" }],
                }}
              />
            </Specimen>

            <Specimen title="Chart ramp">
              <div className="flex h-8 gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className="flex-1 rounded-sm"
                    style={{ background: `var(--chart-${n})` }}
                  />
                ))}
              </div>
            </Specimen>
          </div>
        ))}
      </div>
    </main>
  );
}

const limitSample: BillingOverview = {
  plan: "free",
  planEndsAt: null,
  sentThisMonth: 5,
  monthlyLimit: 5,
  resetsAt: "2026-12-01T00:00:00.000Z",
  canManage: true,
  hasBillingAccount: false,
  owners: [],
};

function Specimen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm text-muted">{title}</h2>
      {children}
    </section>
  );
}
