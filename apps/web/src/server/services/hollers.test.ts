import { eq } from "@holler/core/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { ServiceError } from "./context";
import { makeLive, workspaceFixture } from "./fixtures";
import {
  copyHoller,
  createDraft,
  deleteDraft,
  getHoller,
  homeCounts,
  listHollers,
  type ProblemQuestion,
  presentQuestion,
  sendProblems,
  updateDraft,
} from "./hollers";
import { previewSend } from "./send-preview";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

const pulse = {
  mode: "pulse" as const,
  title: "How was your week?",
  tags: ["Weekly"],
  questions: [
    {
      type: "single" as const,
      style: "scale" as const,
      prompt: "How was it?",
      options: [
        { label: "Rough", score: 1 },
        { label: "Great", score: 2 },
      ],
    },
  ],
};

describe("drafts", () => {
  it("creates a draft with its questions and options in order", async () => {
    const { ctx } = await workspaceFixture(db);
    const holler = await createDraft(ctx, pulse);
    expect(holler.status).toBe("draft");
    expect(holler.tags).toEqual(["weekly"]);
    expect(holler.questions).toHaveLength(1);
    expect(holler.questions[0]?.options.map((o) => o.label)).toEqual(["Rough", "Great"]);
  });

  it("replaces questions on update", async () => {
    const { ctx } = await workspaceFixture(db);
    const holler = await createDraft(ctx, pulse);
    const updated = await updateDraft(ctx, holler.id, {
      ...pulse,
      questions: [{ type: "text", prompt: "Why?" }],
    });
    expect(updated.questions.map((q) => q.prompt)).toEqual(["Why?"]);
  });

  it("changes the mode while a draft or scheduled, and a chase keeps no questions", async () => {
    const { ctx } = await workspaceFixture(db);
    const holler = await createDraft(ctx, pulse);
    const survey = await updateDraft(ctx, holler.id, { ...pulse, mode: "survey" });
    expect(survey.mode).toBe("survey");
    expect(survey.questions).toHaveLength(1);

    await db
      .update(schema.hollers)
      .set({ status: "scheduled" })
      .where(eq(schema.hollers.id, holler.id));
    const chase = await updateDraft(ctx, holler.id, {
      ...pulse,
      mode: "chase",
      externalUrl: "https://forms.example.com/q4",
    });
    expect(chase.mode).toBe("chase");
    expect(chase.questions).toEqual([]);
  });

  it("keeps a scheduled Holler scheduled while it has a send time, and a draft once it has none", async () => {
    const { ctx } = await workspaceFixture(db);
    const sendAt = new Date("2026-12-01T09:00:00Z");
    const holler = await createDraft(ctx, { ...pulse, sendAt });
    await db
      .update(schema.hollers)
      .set({ status: "scheduled" })
      .where(eq(schema.hollers.id, holler.id));
    const later = await updateDraft(ctx, holler.id, {
      ...pulse,
      sendAt: new Date("2026-12-02T09:00:00Z"),
    });
    expect(later.status).toBe("scheduled");
    const now = await updateDraft(ctx, holler.id, { ...pulse, sendAt: null });
    expect(now.status).toBe("draft");
  });

  it("stores a fixed close time on a draft", async () => {
    const { ctx } = await workspaceFixture(db);
    const closesAt = new Date("2026-11-27T18:00:00Z");
    const holler = await createDraft(ctx, { ...pulse, closesAt });
    expect(holler.closesAt).toEqual(closesAt);
    const cleared = await updateDraft(ctx, holler.id, { ...pulse, closesAt: null });
    expect(cleared.closesAt).toBeNull();
  });

  it("refuses to change a live Holler's questions", async () => {
    const { ctx, now } = await workspaceFixture(db);
    const holler = await createDraft(ctx, pulse);
    await makeLive(db, holler.id, ["UA"], now);
    await expect(updateDraft(ctx, holler.id, pulse)).rejects.toMatchObject({ code: "conflict" });
  });

  it("keeps another workspace's hollers out of reach", async () => {
    const a = await workspaceFixture(db);
    const b = await workspaceFixture(db);
    const holler = await createDraft(a.ctx, pulse);
    await expect(getHoller(b.ctx, holler.id)).rejects.toBeInstanceOf(ServiceError);
    expect(await listHollers(b.ctx, { scope: "mine" })).toEqual([]);
  });
});

describe("question extras", () => {
  const extras = {
    mode: "survey" as const,
    title: "Retro",
    questions: [
      {
        type: "multi" as const,
        prompt: "What went well?",
        description: "Pick the ones that stood out.",
        options: [{ label: "Planning" }, { label: "Pairing" }, { label: "Demos" }],
        allowOther: true,
        maxChoices: 2,
        followUp: { prompt: "Anything to add?", onlyAfter: [3] },
      },
      {
        type: "single" as const,
        style: "scale" as const,
        prompt: "How calm was it?",
        options: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), score: n })),
        lowLabel: "Chaos",
        highLabel: "Calm",
      },
      { type: "number" as const, prompt: "Hours in meetings?", numberMin: 0, numberMax: 60 },
      { type: "person" as const, prompt: "Who helped most?", maxChoices: 1 },
    ],
  };

  it("saves every field and returns it in the shape the editor sends", async () => {
    const { ctx } = await workspaceFixture(db);
    const holler = await createDraft(ctx, extras);
    const [multi, scale, number, person] = holler.questions.map(presentQuestion);
    expect(multi).toMatchObject({
      description: "Pick the ones that stood out.",
      allowOther: true,
      maxChoices: 2,
      followUp: { prompt: "Anything to add?", onlyAfter: [3] },
    });
    expect(multi?.options.map((o) => o.label)).toEqual(["Planning", "Pairing", "Demos"]);
    expect(scale).toMatchObject({ lowLabel: "Chaos", highLabel: "Calm" });
    expect(number).toMatchObject({ type: "number", numberMin: 0, numberMax: 60 });
    expect(person).toMatchObject({ type: "person", maxChoices: 1 });
  });

  it("keeps one Other option, last, with the same id across saves", async () => {
    const { ctx } = await workspaceFixture(db);
    const holler = await createDraft(ctx, extras);
    const other = holler.questions[0]?.options.at(-1);
    expect(other).toMatchObject({ label: "Other", isOther: true, position: 3 });

    // The editor sends the question back as it got it, with one more option.
    const sent = holler.questions.map(presentQuestion);
    const [first, ...rest] = sent;
    if (!first) throw new Error("fixture question missing");
    const saved = await updateDraft(ctx, holler.id, {
      ...extras,
      questions: [{ ...first, options: [...first.options, { label: "Retros" }] }, ...rest],
    });
    const options = saved.questions[0]?.options ?? [];
    expect(options.map((o) => o.label)).toEqual([
      "Planning",
      "Pairing",
      "Demos",
      "Retros",
      "Other",
    ]);
    expect(options.filter((o) => o.isOther).map((o) => o.id)).toEqual([other?.id]);
    expect(options.at(-1)?.position).toBe(4);

    const off = await updateDraft(ctx, holler.id, {
      ...extras,
      questions: [{ ...first, allowOther: false, followUp: null }, ...rest],
    });
    expect(off.questions[0]?.options.some((o) => o.isOther)).toBe(false);
  });

  it("says where it is answered and what still stops a send", async () => {
    const { ctx } = await workspaceFixture(db);
    const holler = await createDraft(ctx, extras);
    // A follow-up shown only after some answers needs the web form.
    expect(holler.answeredIn).toBe("web");
    expect(holler.problems).toEqual([{ message: "Choose who to send it to.", field: "audience" }]);
    const quick = await createDraft(ctx, { ...pulse, title: "" });
    expect(quick.answeredIn).toBe("dm");
    expect(quick.displayTitle).toBe("How was it?");
  });

  it("copies a Holler into a new draft with new ids and no send time", async () => {
    const { ctx, now } = await workspaceFixture(db);
    const source = await createDraft(ctx, {
      ...extras,
      audience: { people: ["UA"], groups: [], everyone: false },
      anonymous: true,
      sendAt: new Date(now.getTime() + 3600_000),
      closesAt: new Date(now.getTime() + 7200_000),
    });
    await makeLive(db, source.id, ["UA"], now);
    const copy = await copyHoller(ctx, source.id);
    expect(copy.id).not.toBe(source.id);
    expect(copy).toMatchObject({
      status: "draft",
      title: "Retro",
      anonymous: true,
      sendAt: null,
      closesAt: null,
      audience: { people: ["UA"], groups: [], everyone: false },
    });
    expect(copy.questions.map(presentQuestion).map(({ id: _id, options: _o, ...q }) => q)).toEqual(
      source.questions.map(presentQuestion).map(({ id: _id, options: _o, ...q }) => q),
    );
    const ids = new Set(source.questions.flatMap((q) => [q.id, ...q.options.map((o) => o.id)]));
    expect(copy.questions.some((q) => ids.has(q.id) || q.options.some((o) => ids.has(o.id)))).toBe(
      false,
    );
    const [entry] = await db
      .select()
      .from(schema.activity)
      .where(eq(schema.activity.subjectId, copy.id));
    expect(entry).toMatchObject({ action: "holler.copied", data: { from: source.id } });
  });
});

describe("deleting a draft", () => {
  it("deletes the creator's draft and records it", async () => {
    const { ctx } = await workspaceFixture(db);
    const holler = await createDraft(ctx, pulse);
    await deleteDraft(ctx, holler.id);
    await expect(getHoller(ctx, holler.id)).rejects.toMatchObject({ code: "not_found" });
    const actions = await db
      .select({ action: schema.activity.action })
      .from(schema.activity)
      .where(eq(schema.activity.subjectId, holler.id));
    expect(actions.map((a) => a.action)).toEqual(["holler.created", "holler.deleted"]);
  });

  it("refuses a scheduled or sent Holler", async () => {
    const { ctx, now } = await workspaceFixture(db);
    const scheduled = await createDraft(ctx, pulse);
    await db
      .update(schema.hollers)
      .set({ status: "scheduled" })
      .where(eq(schema.hollers.id, scheduled.id));
    await expect(deleteDraft(ctx, scheduled.id)).rejects.toMatchObject({ code: "conflict" });
    const live = await createDraft(ctx, pulse);
    await makeLive(db, live.id, ["UA"], now);
    await expect(deleteDraft(ctx, live.id)).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses someone who did not make it", async () => {
    const { ctx, workspaceId } = await workspaceFixture(db);
    const holler = await createDraft(ctx, pulse);
    const other = await secondMember(workspaceId);
    await expect(deleteDraft({ ...ctx, actor: other }, holler.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

/** Another member of the same workspace. */
async function secondMember(workspaceId: string) {
  const userId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const at = new Date();
  await db.batch([
    db.insert(schema.user).values({
      id: userId,
      name: "Sender",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: at,
      updatedAt: at,
    }),
    db
      .insert(schema.members)
      .values({ id: memberId, workspaceId, userId, slackUserId: "UA", role: "sender" }),
  ]);
  return { via: "web" as const, memberId, slackUserId: "UA" };
}

describe("home", () => {
  it("counts live, waiting and scheduled", async () => {
    const { ctx, now } = await workspaceFixture(db);
    const live = await createDraft(ctx, pulse);
    await makeLive(db, live.id, ["UA", "UB", "UC"], now);
    await createDraft(ctx, { ...pulse, sendAt: new Date(now.getTime() + 3600_000) });
    expect(await homeCounts(ctx)).toEqual({ live: 1, waiting: 3, scheduled: 0 });
  });

  it("lists with counts, filters by tag and finds by title", async () => {
    const { ctx, now } = await workspaceFixture(db);
    const live = await createDraft(ctx, pulse);
    await makeLive(db, live.id, ["UA", "UB"], now);
    await createDraft(ctx, { mode: "survey", title: "Offsite dates" });
    const all = await listHollers(ctx, { scope: "mine" });
    expect(all).toHaveLength(2);
    const row = all.find((h) => h.id === live.id);
    expect(row).toMatchObject({ recipientCount: 2, answeredCount: 0, questionCount: 1 });
    expect(row?.people.map((p) => p.name)).toEqual(["Person UA", "Person UB"]);
    expect((await listHollers(ctx, { scope: "mine", tag: "WEEKLY" })).map((h) => h.id)).toEqual([
      live.id,
    ]);
    expect((await listHollers(ctx, { scope: "mine", q: "offsite" })).map((h) => h.title)).toEqual([
      "Offsite dates",
    ]);
  });

  it("shows a pulse without a title by its first question, and finds it by it", async () => {
    const { ctx } = await workspaceFixture(db);
    const holler = await createDraft(ctx, { ...pulse, title: "" });
    const [row] = await listHollers(ctx, { scope: "mine" });
    expect(row).toMatchObject({ id: holler.id, title: "How was it?" });
    expect((await listHollers(ctx, { scope: "mine", q: "how was" })).map((h) => h.id)).toEqual([
      holler.id,
    ]);
  });

  it("shows no avatars on an anonymous Holler's row", async () => {
    const { ctx, now } = await workspaceFixture(db);
    const holler = await createDraft(ctx, { ...pulse, anonymous: true });
    await makeLive(db, holler.id, ["UA", "UB"], now);
    const [row] = await listHollers(ctx, { scope: "mine" });
    expect(row).toMatchObject({ recipientCount: 2, people: [] });
  });
  it("lists more Hollers than D1 binds in one statement", async () => {
    const { ctx } = await workspaceFixture(db);
    const many = 101;
    for (let i = 0; i < many; i++) await createDraft(ctx, { ...pulse, title: `Round ${i}` });
    const all = await listHollers(ctx, { scope: "mine" });
    expect(all).toHaveLength(many);
  });

  it("previews a send to the most groups an audience holds", async () => {
    const { ctx, workspaceId } = await workspaceFixture(db);
    const groups = Array.from({ length: 100 }, (_, i) => `S${i}`);
    for (const slackId of groups) {
      await db.insert(schema.slackGroups).values({
        workspaceId,
        slackId,
        kind: "usergroup",
        name: slackId,
        searchName: slackId.toLocaleLowerCase(),
        memberCount: 2,
      });
    }
    const draft = await createDraft(ctx, {
      ...pulse,
      audience: { people: [], groups, everyone: false },
    });
    const preview = await previewSend(ctx, draft.id);
    expect(preview.groups).toHaveLength(100);
    expect(preview.reach).toBe(200);
  });

  it("counts a group once when the audience names it in two lookups", async () => {
    const { ctx, workspaceId } = await workspaceFixture(db);
    const groups = Array.from({ length: 90 }, (_, i) => `S${i}`);
    for (const slackId of groups) {
      await db.insert(schema.slackGroups).values({
        workspaceId,
        slackId,
        kind: "usergroup",
        name: slackId,
        searchName: slackId.toLocaleLowerCase(),
        memberCount: 2,
      });
    }
    const draft = await createDraft(ctx, {
      ...pulse,
      audience: { people: [], groups: [...groups, "S0"], everyone: false },
    });
    const preview = await previewSend(ctx, draft.id);
    expect(preview.groups).toHaveLength(90);
    expect(preview.reach).toBe(180);
  });
});

describe("sendProblems", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  type Checked = Parameters<typeof sendProblems>[0];
  const ready: Checked = {
    mode: "survey",
    title: "Retro",
    externalUrl: null,
    audience: { people: ["UA"], groups: [], everyone: false },
    sendAt: null,
    closesAt: null,
    closeAfterHours: 72,
    repeatRule: null,
    questions: [],
  };
  const question = (over: Partial<ProblemQuestion> = {}): ProblemQuestion => ({
    type: "single",
    style: "plain",
    prompt: "Where?",
    options: [{ label: "Lisbon" }, { label: "Tallinn" }],
    allowOther: false,
    followUp: null,
    lowLabel: null,
    highLabel: null,
    ...over,
  });
  const fields = (holler: Partial<Checked>) =>
    sendProblems({ ...ready, questions: [question()], ...holler }, now).map((p) => p.field);

  it("names every missing piece at once", () => {
    const problems = sendProblems(
      {
        ...ready,
        mode: "chase",
        title: " ",
        audience: { people: [], groups: [], everyone: false },
      },
      now,
    );
    expect(problems.map((p) => p.field)).toEqual(["title", "externalUrl", "audience"]);
  });

  it("asks a survey and a chase for a title, never a pulse", () => {
    expect(fields({ title: "" })).toEqual(["title"]);
    expect(fields({ mode: "pulse", title: "" })).toEqual([]);
  });

  it("lets a custom scale go without words at both ends, but not at one", () => {
    const scale = (lowLabel: string, highLabel: string) =>
      question({ style: "scale", options: [{ label: "1" }, { label: "2" }], lowLabel, highLabel });
    expect(fields({ questions: [scale("", "")] })).toEqual([]);
    expect(fields({ questions: [scale("Calm", "")] })).toEqual(["questions.0.highLabel"]);
  });

  it("lets only a pulse with a send time repeat, closing each round before the next", () => {
    const sendAt = new Date(now.getTime() + 86_400_000);
    const pulse = { mode: "pulse" as const, sendAt, repeatRule: "week" as const };
    expect(fields(pulse)).toEqual([]);
    expect(fields({ ...pulse, mode: "survey" })).toEqual(["repeat"]);
    expect(fields({ ...pulse, sendAt: null })).toEqual(["sendAt"]);
    expect(fields({ ...pulse, closesAt: new Date(sendAt.getTime() + 3_600_000) })).toEqual([
      "closesAt",
    ]);
    expect(fields({ ...pulse, closeAfterHours: 7 * 24 })).toEqual([]);
    expect(fields({ ...pulse, closeAfterHours: 7 * 24 + 1 })).toEqual(["closeAfterHours"]);
    expect(fields({ ...pulse, repeatRule: "fortnight", closeAfterHours: 14 * 24 })).toEqual([]);
  });

  it("caps a pulse at two questions", () => {
    expect(fields({ mode: "pulse", questions: [question(), question(), question()] })).toEqual([
      "questions",
    ]);
  });

  it("points at the question, option and extra at fault", () => {
    const problems = sendProblems(
      {
        ...ready,
        questions: [
          question(),
          question({
            prompt: " ",
            options: [{ label: "Lisbon" }, { label: "" }, { label: "lisbon " }, { label: "Other" }],
            allowOther: true,
            followUp: { prompt: "", onlyAfter: null },
          }),
          question({
            style: "scale",
            options: [{ label: "1" }, { label: "2" }, { label: "3" }],
            lowLabel: "",
            highLabel: "Calm",
          }),
          question({ followUp: { prompt: "Why?", onlyAfter: [] } }),
        ],
      },
      now,
    );
    expect(problems.map((p) => p.field)).toEqual([
      "questions.1.prompt",
      "questions.1.options.1",
      "questions.1.options.2",
      "questions.1.options.3",
      "questions.1.followUp",
      "questions.2.lowLabel",
      "questions.3.followUp",
    ]);
    // Every message says what to do next.
    for (const p of problems) expect(p.message).toMatch(/^[A-Z].*\.$/);
  });

  it("refuses a close time that has passed or comes before the send", () => {
    expect(fields({ closesAt: new Date("2026-11-20T09:00:00Z") })).toEqual(["closesAt"]);
    expect(
      fields({
        sendAt: new Date("2026-11-23T09:00:00Z"),
        closesAt: new Date("2026-11-22T09:00:00Z"),
      }),
    ).toEqual(["closesAt"]);
    expect(
      fields({
        sendAt: new Date("2026-11-23T09:00:00Z"),
        closesAt: new Date("2026-11-27T18:00:00Z"),
      }),
    ).toEqual([]);
  });
});
