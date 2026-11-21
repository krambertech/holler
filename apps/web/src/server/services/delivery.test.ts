import type { HollerDraftInput } from "@holler/core";
import { and, eq } from "@holler/core/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runBatch } from "../batch";
import { runCronPass } from "../cron";
import { type Db, schema } from "../db";
import { SlackApiError } from "../slack/client";
import { testDb } from "../test-db";
import { deliveryEnv, emptyDatabase } from "../test-delivery";
import type { ServiceContext } from "./context";
import {
  closeHoller,
  deliver,
  queueAfterResponse,
  queueCloseWork,
  queueDueInvites,
  queueMissingAnnouncements,
  remindWaiting,
  type SlackSend,
  sendDueHollers,
  sendEffects,
  sendHoller,
  toneFor,
} from "./delivery";
import { workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";
import { closeDueHollers } from "./lifecycle";
import { queueDueReminders, snoozeReminder } from "./reminders";
import { recordResponse } from "./responses";
import { devSlack } from "./slack-connection";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());
// The cron passes read every workspace, so each test starts from an empty database.
beforeEach(() => emptyDatabase(raw));

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** The fixture's clock: Friday 20 November 2026, 10:00 UTC. */
const NOW = new Date("2026-11-20T10:00:00Z");
const at = (offset: number) => new Date(NOW.getTime() + offset);

const weekly = {
  mode: "pulse",
  title: "How was your week?",
  questions: [
    {
      type: "single",
      prompt: "How was your week?",
      options: [{ label: "Good" }, { label: "Fine" }, { label: "Rough" }],
    },
  ],
  audience: { people: ["UA", "UB", "UC"], groups: [], everyone: false },
} satisfies HollerDraftInput;

async function setup(draft: Partial<HollerDraftInput> = {}) {
  const fixture = await workspaceFixture(db, NOW);
  const slack = await devSlack(db, fixture.workspaceId);
  const harness = deliveryEnv(db, raw);
  const holler = await createDraft(fixture.ctx, { ...weekly, ...draft });
  const ctxAt = (when: Date): ServiceContext => ({ ...fixture.ctx, now: () => when });
  return { ...fixture, ...harness, slack, holler, ctxAt };
}

async function live(draft: Partial<HollerDraftInput> = {}) {
  const s = await setup(draft);
  await sendHoller(s.ctx, s.env, s.holler.id);
  await s.drain(NOW);
  const question = s.holler.questions[0];
  const firstOption = question?.options[0];
  if (!question || !firstOption) throw new Error("the fixture has a question with options");
  const answer = (slackUserId: string, when = NOW) =>
    recordResponse(
      { ...s.ctx, now: () => when, actor: { via: "slack", recipientSlackUserId: slackUserId } },
      {
        hollerId: s.holler.id,
        slackUserId,
        via: "slack_button",
        response: { answers: [{ questionId: question.id, optionIds: [firstOption.id] }] },
      },
    );
  return { ...s, answer };
}

const recipientsOf = (hollerId: string) =>
  db.select().from(schema.recipients).where(eq(schema.recipients.hollerId, hollerId));

async function recipient(hollerId: string, slackUserId: string) {
  const row = await db.query.recipients.findFirst({
    where: and(
      eq(schema.recipients.hollerId, hollerId),
      eq(schema.recipients.slackUserId, slackUserId),
    ),
  });
  if (!row) throw new Error(`no recipient ${slackUserId}`);
  return row;
}

const statusOf = async (id: string) =>
  (await db.query.hollers.findFirst({ where: eq(schema.hollers.id, id) }))?.status;

function setPerson(
  workspaceId: string,
  slackUserId: string,
  values: Partial<typeof schema.slackPeople.$inferInsert>,
) {
  return db
    .update(schema.slackPeople)
    .set(values)
    .where(
      and(
        eq(schema.slackPeople.workspaceId, workspaceId),
        eq(schema.slackPeople.slackUserId, slackUserId),
      ),
    );
}

describe("sendHoller", () => {
  it("refuses a draft with every problem at once, each naming its field", async () => {
    const { ctx, env } = await setup();
    // A survey, because a pulse with no title shows its first question instead.
    const draft = await createDraft(ctx, { mode: "survey" });
    await expect(sendHoller(ctx, env, draft.id)).rejects.toMatchObject({
      code: "invalid",
      field: "title",
      problems: [
        { field: "title", message: "Give it a title." },
        { field: "questions", message: "Add a question." },
        { field: "audience", message: "Choose who to send it to." },
      ],
    });
    expect(await statusOf(draft.id)).toBe("draft");
  });

  it("sends now: live, recipients claimed, one invite DM each", async () => {
    const { ctx, env, slack, drain, holler } = await setup();
    const sent = await sendHoller(ctx, env, holler.id);
    expect(sent).toMatchObject({ status: "live", sentAt: NOW, closesAt: at(72 * HOUR) });

    await drain(NOW);
    expect(slack.posted.map((m) => m.channel).sort()).toEqual(["UA", "UB", "UC"]);
    expect(slack.posted[0]?.text).toBe("Person ULEAD sent you a Holler: How was your week?");
    expect(await recipient(holler.id, "UA")).toMatchObject({
      invitedAt: NOW,
      dmChannelId: "DA",
      dmTs: slack.posted.find((m) => m.channel === "UA")?.ts,
      // A day in, inside working hours in UTC, the zone of a person with none set.
      nextReminderAt: at(DAY),
    });
  });

  it("records the send in Activity", async () => {
    const { ctx, env, holler } = await setup();
    await sendHoller(ctx, env, holler.id);
    const rows = await db.query.activity.findMany({
      where: eq(schema.activity.subjectId, holler.id),
    });
    expect(rows.map((row) => row.action)).toContain("holler.sent");
  });

  it("refuses a second send", async () => {
    const { ctx, env, holler } = await setup();
    await sendHoller(ctx, env, holler.id);
    await expect(sendHoller(ctx, env, holler.id)).rejects.toMatchObject({ code: "conflict" });
  });

  it("sends to everyone, the sender included, and skips bots and people who left", async () => {
    const { ctx, env, holler, workspaceId } = await setup({
      audience: { people: [], groups: [], everyone: true },
    });
    await setPerson(workspaceId, "UE", { isBot: true });
    await setPerson(workspaceId, "UF", { isDeleted: true });
    await sendHoller(ctx, env, holler.id);
    const rows = await recipientsOf(holler.id);
    expect(rows.map((r) => r.slackUserId).sort()).toEqual(["UA", "UB", "UC", "UD", "ULEAD"]);
    expect(new Set(rows.map((r) => r.addedVia))).toEqual(new Set(["everyone"]));
  });

  it("resolves user groups and paged channels, keeping the most specific reason", async () => {
    const { ctx, env, holler, slack } = await setup({
      audience: { people: ["UA"], groups: ["SDESIGN", "CTEAM"], everyone: false },
    });
    slack.groups.push({ id: "SDESIGN", name: "Design", handle: "design", members: ["UA", "UB"] });
    slack.pageSize = 2;
    await sendHoller(ctx, env, holler.id);
    const rows = await recipientsOf(holler.id);
    expect(Object.fromEntries(rows.map((r) => [r.slackUserId, r.addedVia]))).toEqual({
      UA: "person",
      UB: "group:SDESIGN",
      UC: "group:CTEAM",
      UD: "group:CTEAM",
      UE: "group:CTEAM",
      UF: "group:CTEAM",
      ULEAD: "group:CTEAM",
    });
  });

  it("refuses an audience with nobody left in Slack", async () => {
    const { ctx, env, holler } = await setup({
      audience: { people: ["UGONE"], groups: [], everyone: false },
    });
    await expect(sendHoller(ctx, env, holler.id)).rejects.toMatchObject({
      code: "invalid",
      field: "audience",
    });
    expect(await statusOf(holler.id)).toBe("draft");
  });

  it("stops at the monthly limit on Free", async () => {
    const { ctx, env, holler, workspaceId, memberId } = await setup();
    await runBatch(
      db,
      [0, 1, 2, 3, 4].map((i) =>
        db.insert(schema.hollers).values({
          id: `hol_used_${i}`,
          workspaceId,
          creatorId: memberId,
          mode: "pulse",
          status: "closed",
          sentAt: new Date("2026-11-02T10:00:00Z"),
          createdVia: "web",
        }),
      ),
    );
    await expect(sendHoller(ctx, env, holler.id)).rejects.toMatchObject({ code: "limit_reached" });
  });

  it("pauses sending once Holler was removed from Slack", async () => {
    const { ctx, env, holler, workspaceId } = await setup();
    await db
      .update(schema.workspaces)
      .set({ uninstalledAt: NOW })
      .where(eq(schema.workspaces.id, workspaceId));
    await expect(sendHoller(ctx, env, holler.id)).rejects.toMatchObject({
      code: "slack_unavailable",
    });
  });

  it("lets only the creator send, close or remind", async () => {
    const { ctx, env, holler, workspaceId } = await setup({ visibility: "workspace" });
    const otherId = "member_other";
    const userId = crypto.randomUUID();
    await db.insert(schema.user).values({
      id: userId,
      name: "Other",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db
      .insert(schema.members)
      .values({ id: otherId, workspaceId, userId, slackUserId: "UA", role: "sender" });
    const other: ServiceContext = {
      ...ctx,
      actor: { via: "web", memberId: otherId, slackUserId: "UA" },
    };
    // A draft is the creator's alone, so to anyone else it does not exist.
    await expect(sendHoller(other, env, holler.id)).rejects.toMatchObject({ code: "not_found" });
    await sendHoller(ctx, env, holler.id);
    await expect(closeHoller(other, env, holler.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(remindWaiting(other, env, holler.id)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("sends to hundreds within D1's and the queue's limits", async () => {
    const { ctx, env, holler, workspaceId, batchSizes } = await setup({
      audience: { people: [], groups: [], everyone: true },
    });
    const ids = Array.from({ length: 250 }, (_, i) => `UBULK${i}`);
    await runBatch(
      db,
      ids.map((slackUserId) =>
        db
          .insert(schema.slackPeople)
          .values({ workspaceId, slackUserId, name: slackUserId, searchName: slackUserId }),
      ),
    );
    await sendHoller(ctx, env, holler.id);
    expect(await recipientsOf(holler.id)).toHaveLength(257);
    expect(batchSizes).toEqual([100, 100, 57]);
  });
});

describe("delivering a queued send", () => {
  it("stores a permanent Slack failure on the recipient and stops their reminders", async () => {
    const { ctx, env, slack, drain, holler } = await setup();
    slack.failures.set("UB", new SlackApiError("chat.postMessage", "user_not_found"));
    await sendHoller(ctx, env, holler.id);
    await drain(NOW);
    expect(await recipient(holler.id, "UB")).toMatchObject({
      failure: "user_not_found",
      nextReminderAt: null,
    });
    expect(slack.posted.map((m) => m.channel).sort()).toEqual(["UA", "UC"]);
  });

  it("throws a rate limit with Slack's wait, and posts once the retry succeeds", async () => {
    const { ctx, env, slack, queued, holler } = await setup();
    slack.failures.set("UA", new SlackApiError("chat.postMessage", "ratelimited", 30));
    await sendHoller(ctx, env, holler.id);
    const invite = queued.find((s) => s.kind === "invite" && s.slackUserId === "UA");
    if (!invite) throw new Error("no invite for UA");
    await expect(deliver(env, db, invite, NOW)).rejects.toMatchObject({ retryAfter: 30 });
    expect((await recipient(holler.id, "UA")).failure).toBeNull();
    slack.failures.delete("UA");
    await deliver(env, db, invite, NOW);
    expect(slack.posted.filter((m) => m.channel === "UA")).toHaveLength(1);
  });

  it("posts an invite once, however often the queue delivers it", async () => {
    const { ctx, env, slack, queued, holler } = await setup();
    await sendHoller(ctx, env, holler.id);
    const invite = queued.find((s) => s.kind === "invite");
    if (!invite) throw new Error("no invite");
    for (let i = 0; i < 3; i++) await deliver(env, db, invite, NOW);
    expect(slack.posted).toHaveLength(1);
  });

  it("drops a reminder that arrives after they answered or the Holler closed", async () => {
    const { ctx, env, slack, holler, answer } = await live();
    await answer("UA");
    const reminder = (slackUserId: string) =>
      deliver(
        env,
        db,
        {
          kind: "reminder",
          hollerId: holler.id,
          slackUserId,
          tone: "gentle",
          queuedAt: NOW.toISOString(),
        },
        NOW,
      );
    await reminder("UA");
    await closeHoller(ctx, env, holler.id);
    await reminder("UB");
    expect(slack.posted.filter((m) => m.text.startsWith("A reminder"))).toEqual([]);
  });

  it("does nothing for a Holler that was deleted", async () => {
    const { env } = await setup();
    await expect(
      deliver(env, db, { kind: "announce", hollerId: "hol_gone" }, NOW),
    ).resolves.toBeUndefined();
  });
});

describe("exactly once under concurrency", () => {
  const times = 5;
  const repeat = <T>(run: () => Promise<T>) =>
    Promise.allSettled(Array.from({ length: times }, run));
  const fulfilled = (results: PromiseSettledResult<unknown>[]) =>
    results.filter((result) => result.status === "fulfilled").length;

  it("sends once when the same Holler is sent five times at once", async () => {
    const { ctx, env, queued, holler } = await setup();
    expect(fulfilled(await repeat(() => sendHoller(ctx, env, holler.id)))).toBe(1);
    expect(await recipientsOf(holler.id)).toHaveLength(3);
    expect(queued.filter((s) => s.kind === "invite")).toHaveLength(3);
  });

  it("closes once and tells the creator once", async () => {
    const { ctx, env, queued, holler } = await live();
    await repeat(() => closeHoller(ctx, env, holler.id));
    expect(queued.filter((s) => s.kind === "close_notice")).toHaveLength(1);
  });

  it("sends one round of reminders for five clicks at once", async () => {
    const { ctx, env, queued, holler } = await live();
    expect(fulfilled(await repeat(() => remindWaiting(ctx, env, holler.id)))).toBe(1);
    expect(queued.filter((s) => s.kind === "reminder")).toHaveLength(3);
  });

  it("claims each scheduled send, invite and reminder once across overlapping cron runs", async () => {
    const sendAt = at(DAY);
    const s = await setup({ sendAt });
    await sendHoller(s.ctx, s.env, s.holler.id);
    const sent = await repeat(() => sendDueHollers(s.env, db, sendAt));
    expect(sent.flatMap((r) => (r.status === "fulfilled" ? r.value : []))).toEqual([s.holler.id]);
    expect(s.queued.filter((q) => q.kind === "invite")).toHaveLength(3);
    await s.drain(sendAt);

    const dueAt = at(2 * DAY);
    await repeat(() => queueDueReminders(s.env, db, dueAt));
    expect(s.queued.filter((q) => q.kind === "reminder")).toHaveLength(3);
    await repeat(() => queueDueInvites(s.env, db, dueAt));
    expect(s.queued.filter((q) => q.kind === "invite")).toHaveLength(0);
  });

  it("records one answer when a person taps five times at once", async () => {
    const { holler, answer } = await live();
    expect(fulfilled(await repeat(() => answer("UA")))).toBe(1);
    const responses = await db.query.responses.findMany({
      where: eq(schema.responses.hollerId, holler.id),
    });
    expect(responses).toHaveLength(1);
  });
});

describe("scheduled sends", () => {
  it("schedules a Holler whose send time is ahead and sends it when the time comes", async () => {
    const sendAt = at(DAY);
    const { ctx, env, holler, slack, drain } = await setup({ sendAt });
    expect((await sendHoller(ctx, env, holler.id)).status).toBe("scheduled");
    expect(await recipientsOf(holler.id)).toHaveLength(0);
    expect(await sendDueHollers(env, db, new Date(sendAt.getTime() - 60_000))).toEqual([]);
    expect(await sendDueHollers(env, db, sendAt)).toEqual([holler.id]);
    await drain(sendAt);
    expect(slack.posted).toHaveLength(3);
  });

  it("puts a Holler that can no longer send back to draft and tells its creator why", async () => {
    const sendAt = at(DAY);
    const { ctx, env, holler, slack, drain } = await setup({ sendAt });
    await sendHoller(ctx, env, holler.id);
    await db
      .update(schema.slackPeople)
      .set({ isDeleted: true })
      .where(eq(schema.slackPeople.workspaceId, ctx.workspaceId));
    expect(await sendDueHollers(env, db, sendAt)).toEqual([]);
    expect(await statusOf(holler.id)).toBe("draft");
    await drain(sendAt);
    expect(slack.posted.map((m) => [m.channel, m.text])).toEqual([
      [
        "ULEAD",
        "How was your week? did not send. Nobody in this audience can get a Holler. Choose people who are in Slack.",
      ],
    ]);
  });

  it("keeps sending the others when one scheduled Holler hits a Slack outage", async () => {
    const sendAt = at(DAY);
    const s = await setup({ sendAt, audience: { people: [], groups: ["SDOWN"], everyone: false } });
    await sendHoller(s.ctx, s.env, s.holler.id);
    s.slack.failures.set("SDOWN", new SlackApiError("usergroups.users.list", "internal_error"));
    const fine = await createDraft(s.ctx, { ...weekly, title: "Fine", sendAt });
    await sendHoller(s.ctx, s.env, fine.id);

    expect(await sendDueHollers(s.env, db, sendAt)).toEqual([fine.id]);
    // An outage is not the sender's mistake: it stays scheduled for the next run.
    expect(await statusOf(s.holler.id)).toBe("scheduled");
    s.slack.failures.delete("SDOWN");
    s.slack.groups.push({ id: "SDOWN", name: "Down", handle: "down", members: ["UA"] });
    expect(await sendDueHollers(s.env, db, at(DAY + 60_000))).toEqual([s.holler.id]);
  });

  it("sends in each person's time zone, at once for anyone whose time passed", async () => {
    // Monday 23 November, 09:00 in Tallinn, the sender's zone.
    const sendAt = new Date("2026-11-23T07:00:00Z");
    const { ctx, env, holler, workspaceId, slack, drain } = await setup({
      sendAt,
      sendInRecipientTimeZone: true,
    });
    await setPerson(workspaceId, "ULEAD", { timeZone: "Europe/Tallinn" });
    await setPerson(workspaceId, "UA", { timeZone: "Asia/Tokyo" });
    await setPerson(workspaceId, "UB", { timeZone: "America/New_York" });
    await setPerson(workspaceId, "UC", { timeZone: "Europe/Tallinn" });

    expect((await sendHoller(ctx, env, holler.id)).status).toBe("scheduled");
    // It goes live when Kiribati reaches 09:00 Monday: Sunday 19:00 UTC.
    expect(await sendDueHollers(env, db, new Date("2026-11-22T18:59:00Z"))).toEqual([]);
    // The cron is late, at Monday 01:00 UTC: 10:00 in Tokyo, so Tokyo gets it at once.
    const late = new Date("2026-11-23T01:00:00Z");
    expect(await sendDueHollers(env, db, late)).toEqual([holler.id]);
    await drain(late);
    expect(slack.posted.map((m) => m.channel)).toEqual(["UA"]);
    expect((await recipient(holler.id, "UC")).sendAt).toEqual(sendAt);
    expect((await recipient(holler.id, "UB")).sendAt).toEqual(new Date("2026-11-23T14:00:00Z"));

    await queueDueInvites(env, db, sendAt);
    await drain(sendAt);
    expect(slack.posted.map((m) => m.channel)).toEqual(["UA", "UC"]);
    // 72 hours after the last person's send, in New York.
    const sent = await db.query.hollers.findFirst({ where: eq(schema.hollers.id, holler.id) });
    expect(sent?.closesAt).toEqual(new Date("2026-11-26T14:00:00Z"));
  });
});

describe("the reminder rhythm", () => {
  it("sends gentle, nudge and last on days one, three and five, then stops", async () => {
    const { env, slack, drain, holler } = await live({ closeAfterHours: 7 * 24 });
    for (const day of [1, 3, 5, 6]) {
      await queueDueReminders(env, db, at(day * DAY));
      await drain(at(day * DAY));
    }
    expect(slack.posted.filter((m) => m.channel === "UA").map((m) => m.text)).toEqual([
      "Person ULEAD sent you a Holler: How was your week?",
      "A reminder: Person ULEAD still needs your answer to How was your week?",
      "Person ULEAD is still waiting on your answer to How was your week? It takes a minute.",
      "Last reminder: How was your week? closes Friday at 10:00.",
    ]);
    expect(await recipient(holler.id, "UA")).toMatchObject({
      remindersSent: 3,
      nextReminderAt: null,
    });
  });

  it("never reminds someone who answered, and keeps quiet near the close time", async () => {
    const { env, queued, drain, holler, answer } = await live();
    await answer("UA");
    await queueDueReminders(env, db, at(DAY));
    expect(queued.flatMap((s) => (s.kind === "reminder" ? [s.slackUserId] : [])).sort()).toEqual([
      "UB",
      "UC",
    ]);
    await drain(at(DAY));
    // The nudge would be 72 hours in, which is when this Holler closes, so none follows.
    expect((await recipient(holler.id, "UB")).nextReminderAt).toBeNull();
  });

  it("waits for 09:00 in each person's own zone", async () => {
    const s = await setup();
    await setPerson(s.workspaceId, "UA", { timeZone: "America/Los_Angeles" });
    await sendHoller(s.ctx, s.env, s.holler.id);
    await s.drain(NOW);
    // A day in is 02:00 in Los Angeles; its first working hour is 09:00 there, 17:00 UTC.
    expect((await recipient(s.holler.id, "UA")).nextReminderAt).toEqual(
      new Date("2026-11-21T17:00:00Z"),
    );
  });

  it("sends none when the creator turned reminders off", async () => {
    const { holler } = await live({ remindersEnabled: false });
    expect((await recipientsOf(holler.id)).map((r) => r.nextReminderAt)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("moves only the snoozer's next reminder", async () => {
    const { ctx, holler, env, drain } = await live({ closeAfterHours: 7 * 24 });
    await queueDueReminders(env, db, at(DAY));
    await drain(at(DAY));
    // Saturday 10:00 UTC is before 15:00, so 15:00 today.
    expect(await snoozeReminder({ ...ctx, now: () => at(DAY) }, holler.id, "UA")).toBe(true);
    expect(await recipient(holler.id, "UA")).toMatchObject({
      snoozedUntil: new Date("2026-11-21T15:00:00Z"),
      // The nudge, three days in, already comes after the snooze.
      nextReminderAt: at(3 * DAY),
    });
    expect((await recipient(holler.id, "UB")).snoozedUntil).toBeNull();
  });
});

describe("Send reminder", () => {
  it("reminds everyone waiting now, as their next tone, once every four hours", async () => {
    const { ctx, env, queued, holler, answer, ctxAt } = await live();
    await answer("UC");
    await remindWaiting(ctx, env, holler.id);
    const tones = () =>
      queued.flatMap((s) => (s.kind === "reminder" ? [[s.slackUserId, s.tone]] : []));
    expect(tones()).toEqual([
      ["UA", "gentle"],
      ["UB", "gentle"],
    ]);
    await expect(remindWaiting(ctxAt(at(4 * HOUR - 60_000)), env, holler.id)).rejects.toMatchObject(
      {
        code: "conflict",
        message: "A reminder went out at 10:00. You can send the next one at 14:00.",
      },
    );
    queued.length = 0;
    await remindWaiting(ctxAt(at(4 * HOUR)), env, holler.id);
    expect(tones()).toEqual([
      ["UA", "nudge"],
      ["UB", "nudge"],
    ]);
  });

  it("says why there is nothing to send", async () => {
    const { ctx, env, holler, answer } = await live();
    for (const person of ["UA", "UB", "UC"]) await answer(person);
    await expect(remindWaiting(ctx, env, holler.id)).rejects.toMatchObject({ code: "conflict" });
    await closeHoller(ctx, env, holler.id);
    await expect(remindWaiting(ctx, env, holler.id)).rejects.toMatchObject({ code: "closed" });
  });

  it("names each tone by how many reminders went", () => {
    expect([1, 2, 3].map(toneFor)).toEqual(["gentle", "nudge", "last"]);
    expect(() => toneFor(0)).toThrow();
    expect(() => toneFor(4)).toThrow();
  });
});

describe("answering and closing", () => {
  it("thanks a person in place with what they picked", async () => {
    const { env, slack, drain, holler, answer } = await live();
    await answer("UA");
    await queueAfterResponse(env, holler.id, "UA");
    await drain(NOW);
    const ua = await recipient(holler.id, "UA");
    expect(slack.updated.map((m) => [m.channel, m.ts, m.text])).toEqual([
      ["DA", ua.dmTs, "Thanks. Your answer to How was your week? is in."],
    ]);
    expect(JSON.stringify(slack.updated[0]?.blocks)).toContain("Good");
  });

  it("also thanks in the older message they tapped", async () => {
    const { env, slack, holler, answer } = await live();
    await answer("UA");
    const tapped = { channel: "DA", ts: "1699999999.000100" };
    await deliver(
      env,
      db,
      { kind: "answered", hollerId: holler.id, slackUserId: "UA", also: tapped },
      NOW,
    );
    expect(slack.updated.map((m) => m.ts)).toEqual([
      (await recipient(holler.id, "UA")).dmTs,
      tapped.ts,
    ]);
  });

  it("keeps an anonymous answer anonymous in the thank-you", async () => {
    const { env, slack, drain, holler, answer } = await live({ anonymous: true });
    await answer("UA");
    await queueAfterResponse(env, holler.id, "UA");
    await drain(NOW);
    const blocks = JSON.stringify(slack.updated[0]?.blocks);
    expect(blocks).toContain("Answered anonymously");
    expect(blocks).not.toContain("Good");
  });

  it("announces in a channel, keeps the count current and never names anyone", async () => {
    const { ctx, env, slack, drain, holler, answer } = await live({ announceChannelId: "CTEAM" });
    expect(slack.posted.find((m) => m.channel === "CTEAM")?.text).toBe(
      "Person ULEAD sent a Holler to 3 people: How was your week?",
    );
    await answer("UB");
    await queueAfterResponse(env, holler.id, "UB");
    await drain(NOW);
    await closeHoller(ctx, env, holler.id);
    await drain(NOW);
    const updates = slack.updated
      .filter((m) => m.channel === "CTEAM")
      .map((m) => JSON.stringify(m.blocks));
    expect(updates[0]).toContain("1 of 3 answered");
    expect(updates.at(-1)).toContain("Closed. 1 of 3 answered.");
    expect(updates.join()).not.toContain("UB");
  });

  it("closes: unanswered DMs say so, answered ones stay, the creator gets the count", async () => {
    const { ctx, env, slack, drain, holler, answer } = await live();
    await answer("UA");
    expect((await closeHoller(ctx, env, holler.id)).status).toBe("closed");
    await drain(NOW);
    expect(slack.updated.map((m) => [m.channel, m.text]).sort()).toEqual([
      ["DB", "How was your week? closed. It takes no more answers."],
      ["DC", "How was your week? closed. It takes no more answers."],
    ]);
    expect(slack.posted.at(-1)).toMatchObject({
      channel: "ULEAD",
      text: "How was your week? closed. 1 of 3 answered.",
    });
  });

  it("closes from the cron at the close time, once", async () => {
    const { env, slack, drain, ctx, holler } = await live();
    const closesAt = at(72 * HOUR);
    expect(await closeDueHollers(db, new Date(closesAt.getTime() - 1))).toEqual([]);
    expect(await closeDueHollers(db, closesAt)).toEqual([holler.id]);
    expect(await closeDueHollers(db, closesAt)).toEqual([]);
    // Closing again by hand changes nothing and tells nobody.
    await closeHoller(ctx, env, holler.id);
    await drain(closesAt);
    expect(slack.posted.filter((m) => m.channel === "ULEAD")).toHaveLength(0);
  });

  it("refuses to close a Holler that was never sent", async () => {
    const { ctx, env, holler } = await setup();
    await expect(closeHoller(ctx, env, holler.id)).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("no claimed work is lost when the queue refuses it", () => {
  const invitesTo = (queued: { kind: string; slackUserId?: string }[]) =>
    queued.flatMap((s) => (s.kind === "invite" && s.slackUserId ? [s.slackUserId] : [])).sort();

  it("a send stays sent, and the cron invites everyone it could not queue", async () => {
    const { ctx, env, queued, refuse, holler, slack, drain } = await setup();
    refuse.add("invite");
    expect((await sendHoller(ctx, env, holler.id)).status).toBe("live");
    expect((await recipientsOf(holler.id)).map((r) => r.invitedAt)).toEqual([null, null, null]);
    refuse.clear();
    await queueDueInvites(env, db, at(60_000));
    expect(invitesTo(queued)).toEqual(["UA", "UB", "UC"]);
    await drain(at(60_000));
    expect(slack.posted).toHaveLength(3);
  });

  it("a queue that fails midway releases only what it never took", async () => {
    const { ctx, env, queued, outage, holler, workspaceId } = await setup({
      audience: { people: [], groups: [], everyone: true },
    });
    await runBatch(
      db,
      Array.from({ length: 250 }, (_, i) =>
        db.insert(schema.slackPeople).values({
          workspaceId,
          slackUserId: `UBULK${i}`,
          name: `UBULK${i}`,
          searchName: `ubulk${i}`,
        }),
      ),
    );
    outage.batchesLeft = 1;
    await sendHoller(ctx, env, holler.id);
    expect(invitesTo(queued)).toHaveLength(100);
    outage.batchesLeft = Number.POSITIVE_INFINITY;
    await queueDueInvites(env, db, at(60_000));
    const all = invitesTo(queued);
    expect(all).toHaveLength(257);
    expect(new Set(all).size).toBe(257);
  });

  it("an invite pass that cannot queue gives its claims back", async () => {
    const sendAt = new Date("2026-11-23T07:00:00Z");
    const s = await setup({ sendAt, sendInRecipientTimeZone: true });
    await setPerson(s.workspaceId, "UB", { timeZone: "America/New_York" });
    await sendHoller(s.ctx, s.env, s.holler.id);
    await sendDueHollers(s.env, db, sendAt);
    s.queued.length = 0;
    const theirs = new Date("2026-11-23T14:00:00Z");
    s.refuse.add("invite");
    await expect(queueDueInvites(s.env, db, theirs)).rejects.toThrow("refusing invite");
    expect((await recipient(s.holler.id, "UB")).invitedAt).toBeNull();
    s.refuse.clear();
    await queueDueInvites(s.env, db, theirs);
    expect(invitesTo(s.queued)).toEqual(["UB"]);
  });

  it("a reminder pass that cannot queue leaves the reminders due for the next run", async () => {
    const { env, queued, refuse, holler, slack, drain } = await live();
    refuse.add("reminder");
    await expect(queueDueReminders(env, db, at(DAY))).rejects.toThrow("refusing reminder");
    expect(await recipient(holler.id, "UA")).toMatchObject({
      remindersSent: 0,
      nextReminderAt: at(DAY),
    });
    refuse.clear();
    await queueDueReminders(env, db, at(DAY + 60_000));
    expect(queued.filter((s) => s.kind === "reminder")).toHaveLength(3);
    await drain(at(DAY + 60_000));
    expect(slack.posted.filter((m) => m.text.startsWith("A reminder"))).toHaveLength(3);
  });

  it("a Send reminder that cannot queue changes nothing, so the creator can try again", async () => {
    const { ctx, env, queued, refuse, holler } = await live();
    const before = await recipientsOf(holler.id);
    refuse.add("reminder");
    await expect(remindWaiting(ctx, env, holler.id)).rejects.toThrow("refusing reminder");
    expect(await recipientsOf(holler.id)).toEqual(before);
    refuse.clear();
    await remindWaiting(ctx, env, holler.id);
    expect(queued.filter((s) => s.kind === "reminder")).toHaveLength(3);
  });

  it("a close stays closed, and the cron queues its notice once", async () => {
    const { ctx, env, queued, refuse, holler } = await live();
    refuse.add("close_notice");
    expect((await closeHoller(ctx, env, holler.id)).status).toBe("closed");
    expect(queued.filter((s) => s.kind === "close_notice")).toHaveLength(0);
    refuse.clear();
    await runCronPass(env, db, at(60_000));
    await runCronPass(env, db, at(120_000));
    expect(queued.filter((s) => s.kind === "close_notice")).toEqual([
      { kind: "close_notice", hollerId: holler.id },
    ]);
  });
});

describe("no claimed close work is stranded", () => {
  it("queues every closed Holler once when the queue fails partway through a pass", async () => {
    const s = await setup();
    const ids = [s.holler.id];
    for (const title of ["Second", "Third"]) {
      ids.push((await createDraft(s.ctx, { ...weekly, title })).id);
    }
    for (const id of ids) await sendHoller(s.ctx, s.env, id);
    await s.drain(NOW);
    const closesAt = at(72 * HOUR);
    expect((await closeDueHollers(db, closesAt)).sort()).toEqual([...ids].sort());

    // The queue takes the first Holler's close work, then goes down.
    s.outage.batchesLeft = 1;
    await expect(queueCloseWork(db, s.env, closesAt)).rejects.toThrow("Queue is down");
    s.outage.batchesLeft = Number.POSITIVE_INFINITY;
    await queueCloseWork(db, s.env, at(72 * HOUR + 60_000));
    await queueCloseWork(db, s.env, at(72 * HOUR + 120_000));
    const notices = s.queued.flatMap((q) => (q.kind === "close_notice" ? [q.hollerId] : []));
    expect(notices.sort()).toEqual([...ids].sort());
  });
});

describe("every send that posts, posts once", () => {
  /** A queued send of each kind that posts, ready to deliver. */
  async function fixtures() {
    const s = await live({ announceChannelId: "CTEAM" });
    const { holler } = s;
    // Start from the state just before each post: no announcement, no invite to UA yet.
    await raw.prepare("update hollers set announce_ts = null where id = ?").bind(holler.id).run();
    await raw.prepare("delete from slack_deliveries").run();
    await raw
      .prepare("update recipients set dm_ts = null where holler_id = ? and slack_user_id = 'UA'")
      .bind(holler.id)
      .run();
    const queuedAt = NOW.toISOString();
    const sends: Record<keyof typeof posting, SlackSend> = {
      invite: { kind: "invite", hollerId: holler.id, slackUserId: "UA" },
      reminder: {
        kind: "reminder",
        hollerId: holler.id,
        slackUserId: "UB",
        tone: "gentle",
        queuedAt,
      },
      announce: { kind: "announce", hollerId: holler.id },
      close_notice: { kind: "close_notice", hollerId: holler.id },
      send_failed: { kind: "send_failed", hollerId: holler.id, reason: "It broke.", queuedAt },
      shared: { kind: "shared", hollerId: holler.id, slackUserId: "UD", queuedAt },
    };
    await db.insert(schema.viewers).values({
      hollerId: holler.id,
      slackUserId: "UD",
      addedById: s.memberId,
      addedAt: NOW,
      notifiedAt: NOW,
    });
    return { ...s, sends };
  }
  const posting = Object.fromEntries(
    Object.entries(sendEffects).filter(([, effect]) => effect === "posts"),
  ) as {
    [K in "invite" | "reminder" | "announce" | "close_notice" | "send_failed" | "shared"]: "posts";
  };

  it("has a case for every kind sendEffects says posts", async () => {
    const { sends } = await fixtures();
    expect(Object.keys(sends).sort()).toEqual(Object.keys(posting).sort());
  });

  for (const kind of Object.keys(posting) as (keyof typeof posting)[]) {
    it(`${kind}: twice at once, then again, is one post`, async () => {
      const { env, slack, sends } = await fixtures();
      const before = slack.posted.length;
      await Promise.all([deliver(env, db, sends[kind], NOW), deliver(env, db, sends[kind], NOW)]);
      await deliver(env, db, sends[kind], NOW);
      expect(slack.posted.length - before).toBe(1);
    });
  }

  it("posts on the retry after Slack failed the first try", async () => {
    const { env, slack, sends } = await fixtures();
    slack.failures.set("ULEAD", new SlackApiError("chat.postMessage", "internal_error"));
    await expect(deliver(env, db, sends.close_notice, NOW)).rejects.toThrow();
    slack.failures.delete("ULEAD");
    await deliver(env, db, sends.close_notice, NOW);
    expect(slack.posted.filter((m) => m.channel === "ULEAD")).toHaveLength(1);
  });
});

describe("announcements the queue never took", () => {
  it("post from the cron once the send is two minutes old, and only once", async () => {
    const { ctx, env, refuse, holler, slack, drain } = await setup({ announceChannelId: "CTEAM" });
    refuse.add("announce");
    expect((await sendHoller(ctx, env, holler.id)).status).toBe("live");
    refuse.clear();
    await drain(NOW);
    expect(await queueMissingAnnouncements(env, db, at(60_000))).toBe(0);
    for (const minute of [2, 3]) {
      await queueMissingAnnouncements(env, db, at(minute * 60_000));
      await drain(at(minute * 60_000));
    }
    expect(slack.posted.filter((m) => m.channel === "CTEAM")).toHaveLength(1);
  });
});

describe("every write a recipient makes in Slack is in Activity", () => {
  it("records a snooze, without who snoozed", async () => {
    const { ctx, holler } = await live({ closeAfterHours: 7 * 24 });
    const recipientCtx: ServiceContext = {
      ...ctx,
      actor: { via: "slack", recipientSlackUserId: "UA" },
    };
    await snoozeReminder(recipientCtx, holler.id, "UA");
    const rows = await db.query.activity.findMany({
      where: eq(schema.activity.action, "reminder.snoozed"),
    });
    expect(rows).toEqual([
      expect.objectContaining({ via: "slack", memberId: null, subjectId: holler.id, data: null }),
    ]);
  });
});
