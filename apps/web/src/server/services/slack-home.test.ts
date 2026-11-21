import type { HollerDraftInput } from "@holler/core";
import { eq } from "@holler/core/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import { queueAfterResponse, remindWaiting, sendHoller } from "./delivery";
import { workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";
import { recordResponse } from "./responses";
import { devSlack } from "./slack-connection";
import {
  homeClaimStaleMs,
  homeDebounceSeconds,
  homeState,
  markHomeOpened,
  publishHome,
  queueHomes,
  slackSenderContext,
} from "./slack-home";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());
beforeEach(() => emptyDatabase(raw));

const NOW = new Date("2026-11-20T10:00:00Z");
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const pulse = (over: Partial<HollerDraftInput> = {}): HollerDraftInput => ({
  mode: "pulse",
  title: "Offsite",
  questions: [
    { type: "single", prompt: "Where?", options: [{ label: "Lisbon" }, { label: "Tallinn" }] },
  ],
  audience: { people: ["UA", "UB"], groups: [], everyone: false },
  ...over,
});

async function setup() {
  const fixture = await workspaceFixture(db, NOW);
  const harness = deliveryEnv(db, raw);
  const slack = await devSlack(db, fixture.workspaceId);
  const homesOf = (user: string) => slack.homes.filter((home) => home.userId === user);
  const send = async (over: Partial<HollerDraftInput> = {}) => {
    const draft = await createDraft(fixture.ctx, pulse(over));
    await sendHoller(fixture.ctx, harness.env, draft.id);
    return draft;
  };
  const homeKinds = () => harness.queued.filter((send) => send.kind === "home");
  return { ...fixture, ...harness, slack, homesOf, send, homeKinds };
}

const homeRow = (workspaceId: string, slackUserId: string) =>
  db.query.slackHomes.findFirst({
    where: (row, { and, eq }) =>
      and(eq(row.workspaceId, workspaceId), eq(row.slackUserId, slackUserId)),
  });

describe("homeState", () => {
  it("lists only live hollers someone got and has not answered, soonest to close first", async () => {
    const { send, drain, workspaceId, env, ctx } = await setup();
    const late = await send({ title: "Later", closeAfterHours: 120 });
    const soon = await send({ title: "Sooner", closeAfterHours: 24 });
    const answered = await send({ title: "Answered" });
    const other = await send({
      title: "Not theirs",
      audience: { people: ["UB"], groups: [], everyone: false },
    });
    await drain(NOW);
    const question = answered.questions[0];
    await recordResponse(ctx, {
      hollerId: answered.id,
      slackUserId: "UA",
      via: "web",
      response: {
        answers: [{ questionId: question?.id ?? "", optionIds: [question?.options[0]?.id ?? ""] }],
      },
    });

    const state = await homeState(env, db, workspaceId, "UA", NOW);
    expect(state.waiting.map((row) => row.holler.id)).toEqual([soon.id, late.id]);
    expect(state.waiting.map((row) => row.holler.id)).not.toContain(other.id);
    expect(state.sender).toBeNull();
  });

  it("gives a member the same three numbers as the web Home, and when Send reminder can go", async () => {
    const { send, drain, workspaceId, env, ctx } = await setup();
    const reminded = await send({ title: "Reminded" });
    await send({ title: "Ready" });
    await drain(NOW);
    await remindWaiting(ctx, env, reminded.id);

    const state = await homeState(env, db, workspaceId, "ULEAD", later(60));
    expect(state.sender?.counts).toEqual({ live: 2, waiting: 4, scheduled: 0 });
    const remind = Object.fromEntries(
      (state.sender?.live ?? []).map((row) => [row.title, row.remind]),
    );
    expect(remind.Ready).toEqual({ status: "ready" });
    expect(remind.Reminded).toEqual({
      status: "wait",
      last: NOW,
      next: new Date(NOW.getTime() + 4 * 3600_000),
    });
  });

  it("acts as the member a Slack user is, and as nobody for someone not signed in", async () => {
    const { workspaceId, memberId } = await setup();
    const base = { db, workspaceId, now: () => NOW };
    expect((await slackSenderContext(base, "ULEAD"))?.actor).toEqual({
      via: "slack",
      memberId,
      slackUserId: "ULEAD",
    });
    expect(await slackSenderContext(base, "UA")).toBeNull();
  });
});

describe("publishing App Home", () => {
  it("publishes a burst of changes once, after a short wait", async () => {
    const { workspaceId, env, homeKinds, queued } = await setup();
    await markHomeOpened(db, workspaceId, "UA", NOW);
    for (let i = 0; i < 5; i++) await queueHomes(env, db, workspaceId, ["UA"], later(i));
    expect(homeKinds()).toEqual([{ kind: "home", workspaceId, slackUserId: "UA" }]);
    expect(queued.length).toBe(1);
  });

  it("asks the queue to wait, so the changes that follow ride along", async () => {
    const fixture = await workspaceFixture(db, NOW);
    const delays: (number | undefined)[] = [];
    const env = {
      ...deliveryEnv(db, raw).env,
      SLACK_SENDS: {
        async sendBatch(messages: Iterable<{ delaySeconds?: number }>) {
          for (const message of messages) delays.push(message.delaySeconds);
        },
      },
    } as unknown as Parameters<typeof queueHomes>[0];
    await markHomeOpened(db, fixture.workspaceId, "UA", NOW);
    await markHomeOpened(db, fixture.workspaceId, "UB", NOW);
    await queueHomes(env, db, fixture.workspaceId, ["UA"], NOW);
    await queueHomes(env, db, fixture.workspaceId, ["UB"], NOW, { soon: true });
    expect(delays).toEqual([homeDebounceSeconds, undefined]);
  });

  it("publishes only to people who opened their Home", async () => {
    const { workspaceId, env, homeKinds } = await setup();
    await markHomeOpened(db, workspaceId, "UA", NOW);
    expect(await queueHomes(env, db, workspaceId, ["UA", "UB"], NOW)).toBe(1);
    expect(homeKinds().map((send) => send.kind === "home" && send.slackUserId)).toEqual(["UA"]);
  });

  it("queues again once the publish runs, and takes over a claim whose publish was lost", async () => {
    const { workspaceId, env, homeKinds, drain, homesOf } = await setup();
    await markHomeOpened(db, workspaceId, "UA", NOW);
    await queueHomes(env, db, workspaceId, ["UA"], NOW);
    await drain(later(5));
    expect(homesOf("UA")).toHaveLength(1);
    expect((await homeRow(workspaceId, "UA"))?.queuedAt).toBeNull();

    await queueHomes(env, db, workspaceId, ["UA"], later(6));
    homeKinds().splice(0);
    const lost = await queueHomes(env, db, workspaceId, ["UA"], later(7));
    expect(lost).toBe(0);
    const retaken = await queueHomes(
      env,
      db,
      workspaceId,
      ["UA"],
      new Date(later(6).getTime() + homeClaimStaleMs),
    );
    expect(retaken).toBe(1);
  });

  it("gives the claim back when the queue refuses, so the next change queues it", async () => {
    const { workspaceId, env, refuse } = await setup();
    await markHomeOpened(db, workspaceId, "UA", NOW);
    refuse.add("home");
    await expect(queueHomes(env, db, workspaceId, ["UA"], NOW)).rejects.toThrow(/refusing home/);
    expect((await homeRow(workspaceId, "UA"))?.queuedAt).toBeNull();
    refuse.delete("home");
    expect(await queueHomes(env, db, workspaceId, ["UA"], later(1))).toBe(1);
  });

  it("claims a hundred people inside D1's bound value limit", async () => {
    const { workspaceId, env, homeKinds } = await setup();
    const people = Array.from({ length: 150 }, (_, i) => `UX${i}`);
    for (const person of people) await markHomeOpened(db, workspaceId, person, NOW);
    expect(await queueHomes(env, db, workspaceId, people, NOW)).toBe(150);
    expect(homeKinds()).toHaveLength(150);
  });

  it("follows a Holler from send to answer on both Homes", async () => {
    const { workspaceId, send, drain, homesOf, ctx, env } = await setup();
    await markHomeOpened(db, workspaceId, "UA", NOW);
    await markHomeOpened(db, workspaceId, "ULEAD", NOW);
    const holler = await send();
    await drain(NOW);
    const text = (user: string) => JSON.stringify(homesOf(user).at(-1)?.view.blocks ?? []);
    expect(text("UA")).toContain("Waiting on you");
    expect(text("UA")).toContain(`"value":"${holler.id}"`);
    expect(text("ULEAD")).toContain("0 of 2 answered");

    const question = holler.questions[0];
    await recordResponse(ctx, {
      hollerId: holler.id,
      slackUserId: "UA",
      via: "slack_button",
      response: {
        answers: [{ questionId: question?.id ?? "", optionIds: [question?.options[0]?.id ?? ""] }],
      },
    });
    await queueAfterResponse(env, holler.id, "UA");
    await drain(later(10));
    expect(text("UA")).toContain("Nothing is waiting on you.");
    expect(text("ULEAD")).toContain("1 of 2 answered");
  });

  it("publishes nothing for a workspace Holler was removed from", async () => {
    const { workspaceId, env, slack } = await setup();
    await markHomeOpened(db, workspaceId, "UA", NOW);
    await db
      .update(schema.workspaces)
      .set({ uninstalledAt: NOW })
      .where(eq(schema.workspaces.id, workspaceId));
    await publishHome(env, db, workspaceId, "UA", NOW);
    expect(slack.homes).toEqual([]);
  });
});
