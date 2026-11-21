import { anonymousTime, newId } from "@holler/core";
import { and, type BatchItem, eq } from "@holler/core/db";
import { runBatch } from "../batch";
import type { Db } from "../db";
import { schema } from "../db";

/**
 * The local workspace every persona signs in to. Only /api/dev/* calls this, and only when
 * DEV_ROUTES is true. Idempotent: it seeds once per database and returns the same rows after.
 * The people and hollers mirror the home screen mockup in DECISIONS.md.
 */
export const DEV_TEAM_ID = "T0DEVHOLLER";
export const DEV_PASSWORD = "holler-dev-persona-password";

export const personas = {
  /** Owner with live, scheduled and closed hollers: the home screen as designed. */
  lead: { slackUserId: "U0LEAD", email: "lead@holler.local", role: "owner" as const },
  /** A sender with nothing sent yet: the empty states. */
  sender: { slackUserId: "U0SENDER", email: "sender@holler.local", role: "sender" as const },
};
export type PersonaName = keyof typeof personas;

const people: [id: string, name: string, tz: string][] = [
  ["U0LEAD", "Mira Kask", "Europe/Tallinn"],
  ["U0SENDER", "Tom Okafor", "Europe/London"],
  ["U0MK", "Marta Kowalska", "Europe/Warsaw"],
  ["U0JW", "Jun Watanabe", "Asia/Tokyo"],
  ["U0AT", "Amara Thompson", "America/New_York"],
  ["U0TR", "Tomás Ruiz", "Europe/Madrid"],
  ["U0SN", "Sofia Nieminen", "Europe/Helsinki"],
  ["U0PS", "Priya Shah", "Asia/Kolkata"],
  ["U0LH", "Lena Hoffmann", "Europe/Berlin"],
  ["U0OB", "Oskar Berg", "Europe/Stockholm"],
  ["U0BC", "Ben Carter", "America/Chicago"],
  ["U0DA", "Dana Alon", "Asia/Jerusalem"],
  ["U0KO", "Kofi Owusu", "Africa/Accra"],
  ["U0YL", "Yara Lima", "America/Sao_Paulo"],
  ["U0IV", "Ilya Volkov", "Europe/Kyiv"],
  ["U0EM", "Emma Moreau", "Europe/Paris"],
  ["U0RG", "Raj Gupta", "Asia/Singapore"],
  ["U0NC", "Nina Costa", "Europe/Lisbon"],
];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export async function seedDevWorkspace(db: Db): Promise<{ workspaceId: string }> {
  const existing = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.slackTeamId, DEV_TEAM_ID),
  });
  if (existing) return { workspaceId: existing.id };

  const workspaceId = newId("workspace");
  try {
    // One batch, so no sign-in ever reads the workspace without its people.
    await runBatch(db, [
      db.insert(schema.workspaces).values({
        id: workspaceId,
        slackTeamId: DEV_TEAM_ID,
        name: "Northwind",
        slackDomain: "northwind-dev",
        plan: "free",
      }),
      // One row per statement: D1 binds at most 100 values in one query.
      ...people.map(([slackUserId, name, timeZone]) =>
        db.insert(schema.slackPeople).values({
          workspaceId,
          slackUserId,
          name,
          displayName: name.split(" ")[0] ?? name,
          email: `${slackUserId.toLowerCase()}@northwind.example`,
          timeZone,
          searchName: name.toLocaleLowerCase(),
        }),
      ),
      db.insert(schema.slackGroups).values({
        workspaceId,
        slackId: "S0DESIGN",
        kind: "usergroup",
        name: "Design team",
        handle: "design",
        memberCount: 6,
        searchName: "design team",
      }),
      db.insert(schema.slackGroups).values({
        workspaceId,
        slackId: "C0GENERAL",
        kind: "channel",
        name: "general",
        memberCount: people.length,
        searchName: "general",
      }),
    ]);
  } catch (error) {
    // Two first sign-ins raced; the unique team id let one batch through. Use the winner's.
    const winner = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.slackTeamId, DEV_TEAM_ID),
    });
    if (winner) return { workspaceId: winner.id };
    throw error;
  }
  return { workspaceId };
}

/** Seeds the lead's hollers once their member row exists. */
export async function seedLeadHollers(db: Db, workspaceId: string, creatorId: string, now: Date) {
  const any = await db.query.hollers.findFirst({ where: eq(schema.hollers.creatorId, creatorId) });
  if (any) return;
  const team = people.slice(2).map(([id]) => id);
  const at = (offset: number) => new Date(now.getTime() + offset);

  type Seed = {
    mode: "pulse" | "survey" | "chase";
    status: "live" | "scheduled" | "closed";
    title: string;
    anonymous?: boolean;
    tags?: string[];
    externalUrl?: string;
    recipients: string[];
    /** Who it goes to when that differs from who got it: a scheduled Holler has no recipients yet. */
    audience?: string[];
    answered: number;
    sentAt?: Date;
    sendAt?: Date;
    closesAt?: Date;
    closedAt?: Date;
    questions: {
      type: "single" | "multi" | "text";
      style?: "plain" | "scale" | "binary";
      prompt: string;
      options?: string[];
    }[];
  };

  const mood = {
    type: "single" as const,
    style: "scale" as const,
    prompt: "How was your week?",
    options: ["Rough", "Okay", "Good", "Great"],
  };
  const seeds: Seed[] = [
    {
      mode: "pulse",
      status: "live",
      title: "How was your week?",
      tags: ["weekly"],
      recipients: [...team.slice(0, 12), "U0SENDER"],
      answered: 7,
      sentAt: at(-2 * DAY),
      closesAt: at(2 * DAY),
      questions: [mood, { type: "text", prompt: "Anything in your way?" }],
    },
    {
      mode: "survey",
      status: "live",
      title: "Offsite: which dates work?",
      recipients: ["U0SENDER", ...team.slice(0, 16), "U0LEAD"],
      answered: 14,
      sentAt: at(-3 * DAY),
      closesAt: at(1 * DAY),
      questions: [
        {
          type: "multi",
          prompt: "Which weeks could you travel?",
          options: ["3 March", "10 March", "17 March", "24 March"],
        },
        {
          type: "single",
          prompt: "Where would you rather go?",
          options: ["Lisbon", "Tallinn", "Kraków"],
        },
        { type: "text", prompt: "Anything we should plan around?" },
      ],
    },
    {
      mode: "chase",
      status: "live",
      title: "Submit your Q4 expenses",
      externalUrl: "https://example.com/expenses",
      recipients: ["U0SENDER", ...team.slice(6, 13)],
      answered: 4,
      sentAt: at(-1 * DAY),
      closesAt: at(10 * DAY),
      questions: [],
    },
    {
      mode: "pulse",
      status: "scheduled",
      title: "Retro: what should we change?",
      anonymous: true,
      recipients: [],
      audience: team.slice(0, 5),
      answered: 0,
      sendAt: at(3 * DAY),
      questions: [{ type: "text", prompt: "What should we change?" }],
    },
    {
      mode: "pulse",
      status: "closed",
      title: "How was your week?",
      tags: ["weekly"],
      recipients: ["U0SENDER", ...team.slice(0, 12)],
      answered: 12,
      sentAt: at(-40 * DAY),
      closesAt: at(-36 * DAY),
      closedAt: at(-36 * DAY),
      questions: [mood],
    },
    {
      mode: "survey",
      status: "closed",
      title: "New laptop: Mac or Framework?",
      recipients: [...team.slice(0, 6), "U0SENDER"],
      answered: 6,
      sentAt: at(-50 * DAY),
      closesAt: at(-46 * DAY),
      closedAt: at(-46 * DAY),
      questions: [
        { type: "single", style: "binary", prompt: "Mac?", options: ["Yes", "No"] },
        { type: "text", prompt: "Why?" },
      ],
    },
    {
      mode: "survey",
      status: "closed",
      title: "Team health check",
      anonymous: true,
      recipients: ["U0SENDER", ...team.slice(0, 9)],
      answered: 8,
      sentAt: at(-45 * DAY),
      closesAt: at(-41 * DAY),
      closedAt: at(-41 * DAY),
      questions: [
        {
          type: "single",
          style: "scale",
          prompt: "How sustainable is your workload?",
          options: ["Not at all", "Barely", "Mostly", "Fully"],
        },
        { type: "text", prompt: "What would make it easier?" },
      ],
    },
  ];

  for (const [order, seed] of seeds.entries()) {
    const hollerId = newId("holler");
    // The key's unique index lets each seeded holler in once when two lead sign-ins race.
    const idempotencyKey = `dev-seed ${order}`;
    const statements: BatchItem<"sqlite">[] = [];
    statements.push(
      db.insert(schema.hollers).values({
        id: hollerId,
        workspaceId,
        creatorId,
        mode: seed.mode,
        status: seed.status,
        title: seed.title,
        searchTitle: seed.title.toLocaleLowerCase(),
        anonymous: seed.anonymous ?? false,
        tags: seed.tags ?? [],
        externalUrl: seed.externalUrl ?? null,
        audience: { people: seed.audience ?? seed.recipients, groups: [], everyone: false },
        sendAt: seed.sendAt ?? null,
        sentAt: seed.sentAt ?? null,
        closesAt: seed.closesAt ?? null,
        closedAt: seed.closedAt ?? null,
        closeQueuedAt: seed.closedAt ?? null,
        createdVia: "web",
        idempotencyKey,
        createdAt: seed.sentAt ?? at(-1 * HOUR),
        updatedAt: seed.closedAt ?? seed.sentAt ?? at(-1 * HOUR),
      }),
    );
    const questionRows = seed.questions.map((q, position) => ({
      id: newId("question"),
      position,
      ...q,
      options: (q.options ?? []).map((label, index) => ({
        id: newId("option"),
        label,
        score: q.style === "scale" ? index + 1 : null,
      })),
    }));
    for (const q of questionRows) {
      statements.push(
        db.insert(schema.questions).values({
          id: q.id,
          hollerId,
          position: q.position,
          type: q.type,
          style: q.style ?? "plain",
          prompt: q.prompt,
        }),
      );
      if (q.options.length > 0) {
        for (const [position, o] of q.options.entries()) {
          statements.push(db.insert(schema.options).values({ ...o, questionId: q.id, position }));
        }
      }
    }
    seed.recipients.forEach((slackUserId, index) => {
      const answered = index < seed.answered;
      const answeredAt =
        answered && seed.sentAt ? new Date(seed.sentAt.getTime() + (index + 1) * HOUR) : null;
      statements.push(
        db.insert(schema.recipients).values({
          hollerId,
          slackUserId,
          addedVia: "person",
          invitedAt: seed.sentAt ?? null,
          // Each invite was a DM, so answering, reminding and closing can edit it.
          dmChannelId: `D${slackUserId.slice(1)}`,
          dmTs: `${Math.floor((seed.sentAt?.getTime() ?? 0) / 1000)}.${String(index).padStart(6, "0")}`,
          answeredAt: answeredAt && seed.anonymous ? anonymousTime(answeredAt) : answeredAt,
          remindersSent: answered ? 0 : 1,
        }),
      );
      if (!answered || seed.mode === "chase") {
        if (answered) {
          statements.push(
            db.insert(schema.responses).values({
              id: newId("response"),
              hollerId,
              slackUserId,
              via: "slack_button",
              submittedAt: answeredAt ?? now,
            }),
          );
        }
        return;
      }
      const responseId = newId("response");
      statements.push(
        db.insert(schema.responses).values({
          id: responseId,
          hollerId,
          slackUserId: seed.anonymous ? null : slackUserId,
          via: index % 3 === 0 ? "slack_modal" : "slack_button",
          submittedAt:
            answeredAt && seed.anonymous ? anonymousTime(answeredAt) : (answeredAt ?? now),
        }),
      );
      if (seed.anonymous) {
        statements.push(
          db.insert(schema.responseOwners).values({ responseId, hollerId, slackUserId }),
        );
      }
      for (const q of questionRows) {
        if (q.type === "text") {
          if (index % 2 === 1) continue;
          statements.push(
            db.insert(schema.answers).values({
              id: newId("answer"),
              responseId,
              questionId: q.id,
              text: sampleTexts[index % sampleTexts.length] ?? "Nothing this week.",
            }),
          );
          continue;
        }
        const picks =
          q.type === "multi"
            ? [index % q.options.length, (index + 1) % q.options.length]
            : [(index * 7 + 3) % q.options.length];
        for (const pick of new Set(picks)) {
          const option = q.options[pick];
          if (!option) continue;
          statements.push(
            db
              .insert(schema.answers)
              .values({ id: newId("answer"), responseId, questionId: q.id, optionId: option.id }),
          );
        }
      }
    });
    try {
      await runBatch(db, statements);
    } catch (error) {
      const winner = await db.query.hollers.findFirst({
        where: and(
          eq(schema.hollers.workspaceId, workspaceId),
          eq(schema.hollers.idempotencyKey, idempotencyKey),
        ),
      });
      if (!winner) throw error;
    }
  }
}

const sampleTexts = [
  "Waiting on the pricing copy before I can ship the page.",
  "Too many meetings on Tuesday.",
  "Nothing this week.",
  "The staging deploy was flaky again.",
  "Need a decision on the onboarding flow.",
];
