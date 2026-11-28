import { type HollerDraft, type HollerOut, hollerDraftSchema, hollerTemplates } from "@holler/core";
import { describe, expect, it } from "vitest";
import {
  adoptIds,
  applyTemplate,
  blankDraft,
  composeProblems,
  draftFromHoller,
  draftFromTemplate,
  isBlank,
  questionProblems,
  toPayload,
} from "./draft";
import { questionFromTemplate } from "./questions/model";

const template = (id: string) => {
  const found = hollerTemplates.find((t) => t.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe("isBlank", () => {
  it("makes no draft for an untouched Holler", () => {
    expect(isBlank(blankDraft("survey"))).toBe(true);
  });

  it("keeps anything someone typed or picked", () => {
    expect(isBlank({ ...blankDraft("survey"), title: "Retro" })).toBe(false);
    expect(isBlank({ ...blankDraft("pulse"), questions: [questionFromTemplate("single")] })).toBe(
      false,
    );
    const audience = { people: ["U1"], groups: [], everyone: false };
    expect(isBlank({ ...blankDraft("chase"), audience })).toBe(false);
  });
});

describe("toPayload", () => {
  it("sends what the server parses, without the editor's keys", () => {
    const draft = draftFromTemplate(template("weekly-pulse"));
    const payload = toPayload(draft);
    expect(hollerDraftSchema.safeParse(payload).success).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('"key"');
  });

  it("sends no questions for a chase", () => {
    const draft = { ...blankDraft("chase"), questions: [questionFromTemplate("text")] };
    expect(toPayload(draft).questions).toEqual([]);
  });

  it("sends an empty form link as none", () => {
    expect(toPayload({ ...blankDraft("chase"), externalUrl: "  " }).externalUrl).toBeNull();
  });
});

describe("templates", () => {
  it("fills every template into a draft the server accepts", () => {
    for (const t of hollerTemplates) {
      expect(hollerDraftSchema.safeParse(toPayload(draftFromTemplate(t))).success, t.id).toBe(true);
    }
  });

  it("keeps a title the sender already wrote", () => {
    const started = { ...blankDraft("survey"), title: "Planning" };
    const applied = applyTemplate(started, template("retro"));
    expect(applied.title).toBe("Planning");
    expect(applied.questions).toHaveLength(3);
  });
});

describe("adoptIds", () => {
  const saved = (ids: string[], optionIds: string[][]): HollerOut["questions"] =>
    ids.map((id, i) => ({
      id,
      position: i,
      type: "single",
      style: "plain",
      prompt: "",
      description: "",
      required: true,
      options: (optionIds[i] ?? []).map((oid, j) => ({
        id: oid,
        position: j,
        label: "",
        score: null,
        isOther: false,
      })),
      allowOther: false,
      maxChoices: null,
      followUp: null,
      lowLabel: null,
      highLabel: null,
      numberMin: null,
      numberMax: null,
    }));

  it("gives new questions and options the ids the server made", () => {
    const q = questionFromTemplate("single");
    const [out] = adoptIds([q], [q], saved(["q1"], [["o1", "o2"]]));
    expect(out?.id).toBe("q1");
    expect(out?.options?.map((o) => o.id)).toEqual(["o1", "o2"]);
  });

  it("leaves a question added while the save was on its way alone", () => {
    const sent = questionFromTemplate("text");
    const later = questionFromTemplate("text");
    const result = adoptIds([sent, later], [sent], saved(["q1"], [[]]));
    expect(result[0]?.id).toBe("q1");
    expect(result[1]?.id).toBeUndefined();
  });
});

describe("draftFromHoller", () => {
  it("reads dates back as dates", () => {
    const at = "2026-12-01T09:00:00.000Z";
    const draft = draftFromHoller({
      ...({} as HollerOut),
      mode: "survey",
      title: "",
      description: "",
      externalUrl: null,
      anonymous: false,
      visibility: "private",
      tags: [],
      audience: { people: [], groups: [], everyone: false },
      announceChannelId: null,
      sendAt: at,
      sendInRecipientTimeZone: false,
      closesAt: null,
      closeAfterHours: 72,
      remindersEnabled: true,
      repeat: null,
      questions: [],
    });
    expect(draft.sendAt?.toISOString()).toBe(at);
    expect(draft.closesAt).toBeNull();
  });

  it("sends back every field the server saves, unchanged by opening and saving", () => {
    const sendAt = new Date("2026-12-01T09:00:00.000Z");
    const closesAt = new Date("2026-12-04T09:00:00.000Z");
    const saved = {
      mode: "pulse",
      title: "Weekly pulse",
      description: "How it went.",
      externalUrl: "https://example.com/form",
      anonymous: true,
      visibility: "workspace",
      tags: ["team"],
      audience: { people: ["U1"], groups: ["S1"], everyone: false },
      announceChannelId: "C1",
      sendAt,
      sendInRecipientTimeZone: true,
      closesAt,
      closeAfterHours: 24,
      remindersEnabled: false,
      repeat: "fortnight",
      questions: [],
    } satisfies HollerDraft;
    expect(Object.keys(saved).sort()).toEqual(Object.keys(hollerDraftSchema.shape).sort());
    const opened = draftFromHoller({
      ...({} as HollerOut),
      ...saved,
      sendAt: sendAt.toISOString(),
      closesAt: closesAt.toISOString(),
    });
    expect(toPayload(opened)).toEqual(saved);
  });
});

describe("problems", () => {
  const problems = [
    { message: "Write the question.", field: "questions.0.prompt" },
    { message: "Give it a title.", field: "title" },
    { message: "Choose who to send it to.", field: "audience" },
    { message: "Close it within 7 days.", field: "closeAfterHours" },
  ];

  it("keys question problems by their field", () => {
    expect(questionProblems(problems)).toEqual({ "questions.0.prompt": "Write the question." });
  });

  it("leaves who and when to the Send stage", () => {
    expect(composeProblems(problems).map((p) => p.field)).toEqual(["questions.0.prompt", "title"]);
  });
});
