import type { BillingOverview } from "@holler/core";
import { LimitReachedMessage } from "@/components/billing/limit-reached";
import { PlanPlate } from "@/components/billing/plan-plate";
import { Variants } from "../frame";
import type { Group } from "./types";

const atLimit: BillingOverview = {
  plan: "free",
  planEndsAt: null,
  sentThisMonth: 5,
  monthlyLimit: 5,
  resetsAt: "2026-12-01T00:00:00.000Z",
  canManage: true,
  hasBillingAccount: false,
  owners: [],
};

const asSender: BillingOverview = { ...atLimit, canManage: false, owners: [{ name: "Mira Kask" }] };

export const billing: Group = {
  slug: "billing",
  title: "Billing",
  lede: "The plan belongs to the workspace. Every member sees it and this month's sends; only owners change it, and senders are told which owner to ask.",
  entries: [
    {
      slug: "plan-plate",
      name: "PlanPlate",
      source: "components/billing/plan-plate.tsx",
      covers: ["PlanSection"],
      note: "The plan, this month's sends against the limit, and what an owner can do. PlanSection places it in Settings and loads the plan itself.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "Free, at the limit",
              render: () => <PlanPlate className="w-full" overview={atLimit} />,
            },
            {
              label: "Team, ending",
              render: () => (
                <PlanPlate
                  className="w-full"
                  overview={{
                    ...atLimit,
                    plan: "team",
                    planEndsAt: "2026-12-20T10:00:00.000Z",
                    sentThisMonth: 14,
                    monthlyLimit: null,
                    hasBillingAccount: true,
                  }}
                />
              ),
            },
            {
              label: "A sender looking",
              render: () => (
                <PlanPlate className="w-full" overview={{ ...asSender, sentThisMonth: 2 }} />
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "limit-reached",
      name: "LimitReached",
      source: "components/billing/limit-reached.tsx",
      covers: ["LimitReachedMessage"],
      note: "Beside Send when a send returns 402. The draft is safe either way. Send keeps the screen's plum button, so this one is secondary.",
      Demo: () => (
        <Variants
          stack
          items={[
            {
              label: "An owner",
              render: () => <LimitReachedMessage className="w-full" overview={atLimit} />,
            },
            {
              label: "A sender",
              render: () => <LimitReachedMessage className="w-full" overview={asSender} />,
            },
          ]}
        />
      ),
    },
  ],
};
