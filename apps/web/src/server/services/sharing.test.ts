import { newId } from "@holler/core";
import { and, eq } from "@holler/core/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import type { ServiceContext } from "./context";
import { makeLive, workspaceFixture } from "./fixtures";
import { createDraft, getHoller, listHollers } from "./hollers";
import { recordResponse } from "./responses";
import {
  addViewers,
  getReport,
  getSharing,
  makeReportLink,
  queueShareNotices,
  removeViewer,
  setVisibility,
  turnOffReportLink,
} from "./sharing";
import { devSlack } from "./slack-connection";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());
beforeEach(() => emptyDatabase(raw));

const NOW = new Date("2026-11-20T10:00:00Z");

async function signIn(base: ServiceContext, slackUserId: string): Promise<ServiceContext> {
  const userId = crypto.randomUUID();
  const memberId = newId("member");
  await db.batch([
    db.insert(schema.user).values({
      id: userId,
      name: slackUserId,
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    }),
    db
      .insert(schema.members)
      .values({ id: memberId, workspaceId: base.workspaceId, userId, slackUserId }),
  ]);
  return { ...base, actor: { via: "web", memberId, slackUserId } };
}

async function setup({ anonymous = false } = {}) {
  const fixture = await workspaceFixture(db, NOW);
  const slack = await devSlack(db, fixture.workspaceId);
  const harness = deliveryEnv(db, raw);
  const holler = await createDraft(fixture.ctx, {
    mode: "survey",
    title: "Offsite",
    anonymous,
    questions: [
      {
        type: "single",
        prompt: "Where?",
        options: [{ label: "Lisbon" }, { label: "Tallinn" }],
        followUp: { prompt: "Why?" },
      },
      { type: "text", prompt: "Anything else?" },
    ],
  });
  await makeLive(db, holler.id, ["UA", "UB", "UC", "UD", "UE"], NOW);
  const [where, text] = holler.questions;
  const answer = (slackUserId: string, words: string) =>
    recordResponse(
      { ...fixture.ctx, actor: { via: "slack", recipientSlackUserId: slackUserId } },
      {
        hollerId: holler.id,
        slackUserId,
        via: "slack_modal",
        response: {
          answers: [
            {
              questionId: where?.id ?? "",
              optionIds: [where?.options[0]?.id ?? ""],
              note: `${words} note`,
            },
            { questionId: text?.id ?? "", text: words },
          ],
        },
      },
    );
  return { ...fixture, ...harness, slack, holler, answer };
}

const sharesQueued = (queued: { kind: string }[]) => queued.filter((q) => q.kind === "shared");

const activity = (hollerId: string) =>
  db
    .select({ action: schema.activity.action, data: schema.activity.data })
    .from(schema.activity)
    .where(eq(schema.activity.subjectId, hollerId))
    .orderBy(schema.activity.at);

function writesOnlyInBatches(db: Db): Db {
  const guard = <T extends object>(builder: T): T =>
    new Proxy(builder, {
      get(target, key, receiver) {
        if (key === "then") {
          return () => {
            throw new Error("A sharing write ran outside a batch, apart from its Activity.");
          };
        }
        const value = Reflect.get(target, key, receiver);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          const out = value.apply(target, args);
          return out === target || (out && typeof out === "object" && "then" in out)
            ? guard(out)
            : out;
        };
      },
    });
  return new Proxy(db, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (key === "insert" || key === "update" || key === "delete") {
        return (...args: unknown[]) => guard(value.apply(target, args));
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("viewers", () => {
  it("see the Holler once shared, and not after they are removed", async () => {
    const { ctx, env, holler } = await setup();
    const ua = await signIn(ctx, "UA");
    await expect(getHoller(ua, holler.id)).rejects.toMatchObject({ code: "not_found" });

    const sharing = await addViewers(ctx, env, holler.id, { slackUserIds: ["UA"] });
    expect(sharing.viewers).toMatchObject([{ slackUserId: "UA", name: "Person UA", member: true }]);
    expect((await getHoller(ua, holler.id)).isCreator).toBe(false);
    expect((await listHollers(ua, { scope: "shared" })).map((h) => h.id)).toEqual([holler.id]);

    await removeViewer(ctx, env, holler.id, "UA");
    await expect(getHoller(ua, holler.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await activity(holler.id)).map((a) => a.action)).toEqual(
      expect.arrayContaining(["viewer.added", "viewer.removed"]),
    );
  });

  it("reach someone who signs in to Holler after the share", async () => {
    const { ctx, env, holler } = await setup();
    const sharing = await addViewers(ctx, env, holler.id, { slackUserIds: ["UB"] });
    expect(sharing.viewers).toMatchObject([{ slackUserId: "UB", member: false }]);
    const ub = await signIn(ctx, "UB");
    expect((await getHoller(ub, holler.id)).id).toBe(holler.id);
    expect((await getSharing(ctx, env, holler.id)).viewers[0]?.member).toBe(true);
  });

  it("are only added by the creator, from this workspace's Slack, never twice", async () => {
    const { ctx, env, holler } = await setup();
    const ua = await signIn(ctx, "UA");
    await addViewers(ctx, env, holler.id, { slackUserIds: ["UA"] });
    await expect(addViewers(ua, env, holler.id, { slackUserIds: ["UB"] })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(removeViewer(ua, env, holler.id, "UA")).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      addViewers(ctx, env, holler.id, { slackUserIds: ["UNOBODY"] }),
    ).rejects.toMatchObject({ code: "invalid", field: "slackUserIds" });
    const again = await addViewers(ctx, env, holler.id, { slackUserIds: ["UA", "ULEAD", "UA"] });
    expect(again.viewers.map((v) => v.slackUserId)).toEqual(["UA"]);
  });

  it("are added and removed once when the same change arrives twice at once", async () => {
    const { ctx, env, holler, queued, drain, slack } = await setup();
    const later = { ...ctx, now: () => new Date(NOW.getTime() + 1000) };
    await Promise.all([
      addViewers(ctx, env, holler.id, { slackUserIds: ["UA"] }),
      addViewers(later, env, holler.id, { slackUserIds: ["UA"] }),
    ]);
    expect(sharesQueued(queued)).toHaveLength(1);
    await drain(new Date(NOW.getTime() + 2000));
    expect(slack.posted.filter((m) => m.channel === "UA")).toHaveLength(1);
    await Promise.all([
      removeViewer(ctx, env, holler.id, "UA"),
      removeViewer(later, env, holler.id, "UA"),
    ]);
    await Promise.all([makeReportLink(ctx, env, holler.id), makeReportLink(later, env, holler.id)]);
    await Promise.all([
      turnOffReportLink(ctx, env, holler.id),
      turnOffReportLink(later, env, holler.id),
    ]);
    expect(
      (await activity(holler.id))
        .map((a) => a.action)
        .filter((a) => a !== "holler.created")
        .sort(),
    ).toEqual(["report_link.made", "report_link.turned_off", "viewer.added", "viewer.removed"]);
  });

  it("change who sees a Holler only in the same batch as its Activity", async () => {
    const { ctx, env, holler } = await setup();
    const guarded = { ...ctx, db: writesOnlyInBatches(db) };
    await addViewers(guarded, env, holler.id, { slackUserIds: ["UA", "UB"] });
    await removeViewer(guarded, env, holler.id, "UA");
    await setVisibility(guarded, env, holler.id, "workspace");
    await makeReportLink(guarded, env, holler.id);
    await turnOffReportLink(guarded, env, holler.id);
    await expect(
      ctx.db.update(schema.hollers).set({ title: "x" }).where(eq(schema.hollers.id, "none")),
    ).resolves.toBeDefined();
    await expect(
      (async () => {
        await guarded.db
          .update(schema.hollers)
          .set({ title: "x" })
          .where(eq(schema.hollers.id, "none"));
      })(),
    ).rejects.toThrow("outside a batch");
  });

  it("cannot be added to a draft, which nobody but its creator ever sees", async () => {
    const { ctx, env } = await setup();
    const draft = await createDraft(ctx, { mode: "pulse", title: "Later" });
    await expect(addViewers(ctx, env, draft.id, { slackUserIds: ["UA"] })).rejects.toMatchObject({
      code: "invalid",
    });
    await setVisibility(ctx, env, draft.id, "workspace");
    const ua = await signIn(ctx, "UA");
    await expect(getHoller(ua, draft.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("the shared-with-you DM", () => {
  it("goes once to each new viewer, saying who shared what, with a link", async () => {
    const { ctx, env, holler, queued, drain, slack } = await setup();
    await addViewers(ctx, env, holler.id, { slackUserIds: ["UA", "UB"] });
    await addViewers(ctx, env, holler.id, { slackUserIds: ["UA"] });
    expect(sharesQueued(queued)).toHaveLength(2);
    await drain(NOW);
    const dms = slack.posted.filter((m) => m.channel === "UA" || m.channel === "UB");
    expect(dms).toHaveLength(2);
    expect(dms[0]?.text).toBe("<@ULEAD> shared the results of Offsite with you.");
    expect(JSON.stringify(dms[0]?.blocks)).toContain(`/hollers/${holler.id}`);
  });

  it("is sent by the cron when the queue refused it, and only once", async () => {
    const { ctx, env, holler, refuse, queued, drain, slack } = await setup();
    refuse.add("shared");
    const sharing = await addViewers(ctx, env, holler.id, { slackUserIds: ["UA"] });
    expect(sharing.viewers).toHaveLength(1);
    refuse.clear();
    const later = new Date(NOW.getTime() + 60_000);
    expect(await queueShareNotices(env, db, later)).toBe(1);
    expect(await queueShareNotices(env, db, later)).toBe(0);
    expect(sharesQueued(queued)).toHaveLength(1);
    await drain(later);
    expect(slack.posted.filter((m) => m.channel === "UA")).toHaveLength(1);
  });

  it("posts once when the queue takes it and then throws, and the cron queues it again", async () => {
    const { ctx, env, holler, queued, drain, slack } = await setup();
    const queue = env.SLACK_SENDS as unknown as { sendBatch: (batch: unknown) => Promise<void> };
    const takes = queue.sendBatch;
    queue.sendBatch = async (batch) => {
      queue.sendBatch = takes;
      await takes(batch);
      throw new Error("The queue took the batch, and the reply was lost");
    };
    await addViewers(ctx, env, holler.id, { slackUserIds: ["UA"] });
    const later = new Date(NOW.getTime() + 60_000);
    expect(await queueShareNotices(env, db, later)).toBe(1);
    expect(sharesQueued(queued)).toHaveLength(2);
    await drain(later);
    expect(slack.posted.filter((m) => m.channel === "UA")).toHaveLength(1);
  });

  it("is not sent to someone removed before it went", async () => {
    const { ctx, env, holler, drain, slack } = await setup();
    await addViewers(ctx, env, holler.id, { slackUserIds: ["UA"] });
    await removeViewer(ctx, env, holler.id, "UA");
    await drain(NOW);
    expect(slack.posted.filter((m) => m.channel === "UA")).toHaveLength(0);
  });
});

describe("visibility", () => {
  it("opens a sent Holler to every member, and closes it again", async () => {
    const { ctx, env, holler } = await setup();
    const uc = await signIn(ctx, "UC");
    expect((await setVisibility(ctx, env, holler.id, "workspace")).visibility).toBe("workspace");
    expect((await getHoller(uc, holler.id)).id).toBe(holler.id);
    await expect(setVisibility(uc, env, holler.id, "private")).rejects.toMatchObject({
      code: "forbidden",
    });
    await setVisibility(ctx, env, holler.id, "private");
    await expect(getHoller(uc, holler.id)).rejects.toMatchObject({ code: "not_found" });
    const changes = (await activity(holler.id)).filter(
      (a) => a.action === "holler.visibility_changed",
    );
    expect(changes.map((a) => a.data)).toEqual([{ to: "workspace" }, { to: "private" }]);
  });
});

describe("the report link", () => {
  const tokenOf = (url: string | null) => url?.split("/report/")[1] ?? "";

  it("is made once, opens the results for anyone, and stops when turned off", async () => {
    const { ctx, env, holler, answer } = await setup();
    await answer("UA", "Sunshine");
    const first = await makeReportLink(ctx, env, holler.id);
    const second = await makeReportLink(ctx, env, holler.id);
    expect(first.reportUrl).toMatch(/^http:\/\/localhost:5280\/report\/[A-Za-z0-9_-]{43}$/);
    expect(second.reportUrl).toBe(first.reportUrl);

    const report = await getReport(db, tokenOf(first.reportUrl), NOW);
    expect(report).toMatchObject({
      title: "Offsite",
      workspaceName: "Test",
      recipientCount: 5,
      answeredCount: 1,
      results: { state: "open" },
    });

    await turnOffReportLink(ctx, env, holler.id);
    await expect(getReport(db, tokenOf(first.reportUrl), NOW)).rejects.toMatchObject({
      code: "not_found",
    });
    const remade = await makeReportLink(ctx, env, holler.id);
    expect(remade.reportUrl).not.toBe(first.reportUrl);
    expect((await activity(holler.id)).map((a) => a.action)).toEqual(
      expect.arrayContaining(["report_link.made", "report_link.turned_off"]),
    );
  });

  it("names no one on a named Holler", async () => {
    const { ctx, env, holler, answer } = await setup();
    for (const person of ["UA", "UB", "UC"]) await answer(person, `From ${person}`);
    const { reportUrl } = await makeReportLink(ctx, env, holler.id);
    const report = JSON.stringify(await getReport(db, tokenOf(reportUrl), NOW));
    expect(report).toContain("From UB");
    for (const person of ["UA", "UB", "UC", "ULEAD"]) {
      expect(report).not.toContain(`"${person}"`);
      expect(report).not.toContain(`Person ${person}`);
    }
  });

  it("keeps an anonymous Holler's results closed under the threshold", async () => {
    const { ctx, env, holler, answer } = await setup({ anonymous: true });
    await answer("UA", "Quietly");
    const { reportUrl } = await makeReportLink(ctx, env, holler.id);
    const report = await getReport(db, tokenOf(reportUrl), NOW);
    expect(report.results).toEqual({ state: "gated", responseCount: 1, needed: 4 });
    expect(JSON.stringify(report)).not.toContain("Quietly");
  });

  it("is only made by the creator, once the Holler is sent", async () => {
    const { ctx, env, holler } = await setup();
    const ua = await signIn(ctx, "UA");
    await addViewers(ctx, env, holler.id, { slackUserIds: ["UA"] });
    await expect(makeReportLink(ua, env, holler.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(getSharing(ua, env, holler.id)).rejects.toMatchObject({ code: "forbidden" });
    const draft = await createDraft(ctx, { mode: "pulse", title: "Later" });
    await expect(makeReportLink(ctx, env, draft.id)).rejects.toMatchObject({ code: "invalid" });
  });

  it("opens nothing for a token that is not one", async () => {
    for (const token of ["", "short", "x".repeat(43), "../../etc/passwd"]) {
      await expect(getReport(db, token, NOW)).rejects.toMatchObject({ code: "not_found" });
    }
  });

  it("stops opening once the Holler goes", async () => {
    const { ctx, env, holler } = await setup();
    const { reportUrl } = await makeReportLink(ctx, env, holler.id);
    await db.delete(schema.hollers).where(and(eq(schema.hollers.id, holler.id)));
    await expect(getReport(db, tokenOf(reportUrl), NOW)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
