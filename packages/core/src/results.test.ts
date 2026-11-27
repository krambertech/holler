import { describe, expect, it } from "vitest";
import {
  anonymousThreshold,
  anonymousTime,
  type ResultsQuestion,
  summarize,
  withoutNames,
} from "./results";

const mood: ResultsQuestion = {
  id: "q1",
  prompt: "How was your week?",
  type: "single",
  style: "scale",
  options: [
    { id: "o1", label: "Rough", score: 1 },
    { id: "o2", label: "Okay", score: 2 },
    { id: "o3", label: "Great", score: 3 },
  ],
};
const blockers: ResultsQuestion = {
  id: "q2",
  prompt: "Anything in your way?",
  type: "text",
  style: "plain",
  options: [],
};

const answer = (
  responseId: string,
  questionId: string,
  optionId: string | null,
  text: string | null = null,
) => ({
  responseId,
  questionId,
  optionId,
  text,
  slackUserId: `U${responseId}`,
});

describe("summarize", () => {
  it("counts options, shares and the scale average", () => {
    const results = summarize({
      anonymous: false,
      responseCount: 3,
      questions: [mood],
      answers: [answer("1", "q1", "o3"), answer("2", "q1", "o3"), answer("3", "q1", "o1")],
    });
    expect(results.state).toBe("open");
    if (results.state !== "open") return;
    const [q] = results.questions;
    if (!q || (q.type !== "single" && q.type !== "multi"))
      throw new Error("expected a choice question");
    expect(q.answeredCount).toBe(3);
    expect(q.options.map((o) => o.count)).toEqual([1, 0, 2]);
    expect(q.options[2]?.share).toBeCloseTo(2 / 3);
    expect(q.average).toBe(2.3);
    expect(q.options[2]?.slackUserIds).toEqual(["U1", "U2"]);
  });

  it("gates an anonymous Holler under the threshold", () => {
    const results = summarize({
      anonymous: true,
      responseCount: anonymousThreshold - 1,
      questions: [mood],
      answers: [],
    });
    expect(results).toEqual({ state: "gated", responseCount: 4, needed: 1 });
  });

  it("never names anyone on an anonymous Holler, even past the threshold", () => {
    const answers = ["1", "2", "3", "4", "5"].flatMap((id) => [
      answer(id, "q1", "o2"),
      answer(id, "q2", null, `note ${id}`),
    ]);
    const results = summarize({
      anonymous: true,
      responseCount: 5,
      questions: [mood, blockers],
      answers,
    });
    expect(JSON.stringify(results)).not.toMatch(/U\d/);
  });

  it("skips blank text answers", () => {
    const results = summarize({
      anonymous: false,
      responseCount: 2,
      questions: [blockers],
      answers: [answer("1", "q2", null, "  "), answer("2", "q2", null, "The pricing copy")],
    });
    if (results.state !== "open") throw new Error("expected open");
    const [q] = results.questions;
    expect(q?.type === "text" && q.texts.map((t) => t.text)).toEqual(["The pricing copy"]);
  });
});

describe("anonymousTime", () => {
  it("rounds down to the hour", () => {
    expect(anonymousTime(new Date("2026-11-20T10:47:13Z")).toISOString()).toBe(
      "2026-11-20T10:00:00.000Z",
    );
  });

  it("sums up number answers", () => {
    const results = summarize({
      anonymous: false,
      responseCount: 4,
      questions: [{ id: "n", prompt: "Days off", type: "number", style: "plain", options: [] }],
      answers: ["3", "10", "1", "4"].map((text, i) => ({
        responseId: String(i),
        questionId: "n",
        optionId: null,
        text,
        slackUserId: `U${i}`,
      })),
    });
    if (results.state !== "open") throw new Error("expected open results");
    const [q] = results.questions;
    if (q?.type !== "number") throw new Error("expected a number question");
    expect([q.average, q.median, q.min, q.max]).toEqual([4.5, 3.5, 1, 10]);
  });

  it("counts people picked, most picked first, and hides pickers when anonymous", () => {
    const pick = (responseId: string, text: string) => ({
      responseId,
      questionId: "p",
      optionId: null,
      text,
      slackUserId: null,
    });
    const results = summarize({
      anonymous: true,
      responseCount: 5,
      questions: [{ id: "p", prompt: "Who helped?", type: "person", style: "plain", options: [] }],
      answers: [
        pick("1", "UA"),
        pick("2", "UB"),
        pick("3", "UB"),
        pick("4", "UB"),
        pick("5", "UA"),
      ],
      names: new Map([["UB", "Bea"]]),
    });
    if (results.state !== "open") throw new Error("expected open results");
    const [q] = results.questions;
    if (q?.type !== "person") throw new Error("expected a person question");
    expect(q.people.map((p) => [p.name, p.count, p.pickedBy])).toEqual([
      ["Bea", 3, []],
      ["UA", 2, []],
    ]);
  });

  it("lists follow-up notes and Other write-ins beside a choice question", () => {
    const results = summarize({
      anonymous: false,
      responseCount: 1,
      questions: [mood],
      answers: [answer("1", "q1", "o1")],
      notes: [
        { responseId: "1", questionId: "q1", kind: "note", text: "Long week", slackUserId: "U1" },
        { responseId: "1", questionId: "q1", kind: "other", text: " ", slackUserId: "U1" },
      ],
    });
    if (results.state !== "open") throw new Error("expected open results");
    const [q] = results.questions;
    if (q?.type !== "single") throw new Error("expected a choice question");
    expect(q.notes).toEqual([{ text: "Long week", slackUserId: "U1" }]);
    expect(q.otherTexts).toEqual([]);
  });

  it("gives the same anonymous results whatever order the answers arrived in", () => {
    const choice: ResultsQuestion = {
      id: "c",
      prompt: "Pick",
      type: "single",
      style: "plain",
      options: [
        { id: "a", label: "A", score: null },
        { id: "other", label: "Other", score: null, isOther: true },
      ],
    };
    const qs: ResultsQuestion[] = [
      choice,
      mood,
      blockers,
      { id: "n", prompt: "Days", type: "number", style: "plain", options: [] },
      { id: "p", prompt: "Who", type: "person", style: "plain", options: [] },
    ];
    const answers = Array.from({ length: 8 }, (_, i) => [
      { responseId: `r${i}`, questionId: "c", optionId: i % 2 ? "a" : "other", text: null },
      { responseId: `r${i}`, questionId: "q1", optionId: `o${(i % 3) + 1}`, text: null },
      { responseId: `r${i}`, questionId: "q2", optionId: null, text: `blocker ${(i * 5) % 8}` },
      { responseId: `r${i}`, questionId: "n", optionId: null, text: String((i * 3) % 7) },
      { responseId: `r${i}`, questionId: "p", optionId: null, text: `U${i % 3}` },
    ])
      .flat()
      .map((a) => ({ ...a, slackUserId: null }));
    const notes = Array.from({ length: 8 }, (_, i) => [
      { responseId: `r${i}`, questionId: "c", kind: "note" as const, text: `note ${(i * 3) % 8}` },
      {
        responseId: `r${i}`,
        questionId: "c",
        kind: "other" as const,
        text: `other ${(i * 7) % 8}`,
      },
    ])
      .flat()
      .map((n) => ({ ...n, slackUserId: null }));
    const run = (seed: number) => {
      let state = seed;
      const random = () => {
        state = (state * 1103515245 + 12345) % 2 ** 31;
        return state / 2 ** 31;
      };
      const shuffle = <T>(list: T[]) =>
        list
          .map((item) => ({ item, key: random() }))
          .sort((x, y) => x.key - y.key)
          .map(({ item }) => item);
      return summarize({
        anonymous: true,
        responseCount: 8,
        questions: qs,
        answers: shuffle(answers),
        notes: shuffle(notes),
      });
    };
    const first = run(1);
    for (let seed = 2; seed <= 25; seed++) expect(run(seed), `seed ${seed}`).toEqual(first);
  });
});

describe("withoutNames", () => {
  const every: ResultsQuestion[] = [
    {
      ...mood,
      options: [...mood.options, { id: "o4", label: "Other", score: null, isOther: true }],
    },
    blockers,
    { id: "q3", prompt: "Which days?", type: "multi", style: "plain", options: mood.options },
    { id: "q4", prompt: "How many nights?", type: "number", style: "plain", options: [] },
    { id: "q5", prompt: "Who should lead?", type: "person", style: "plain", options: [] },
  ];
  const named = (order: number[]) =>
    summarize({
      anonymous: false,
      responseCount: 3,
      questions: every,
      names: new Map([["UPICKED", "Picked Person"]]),
      answers: order.flatMap((n) => [
        answer(`${n}`, "q1", n === 3 ? "o4" : "o1"),
        answer(`${n}`, "q2", null, `blocked ${n}`),
        answer(`${n}`, "q3", "o2"),
        answer(`${n}`, "q4", null, `${n * 2}`),
        answer(`${n}`, "q5", null, "UPICKED"),
      ]),
      notes: order.flatMap((n) => [
        {
          responseId: `${n}`,
          questionId: "q1",
          kind: "note" as const,
          text: `note ${n}`,
          slackUserId: `U${n}`,
        },
        ...(n === 3
          ? [
              {
                responseId: "3",
                questionId: "q1",
                kind: "other" as const,
                text: "Riga",
                slackUserId: "U3",
              },
            ]
          : []),
      ]),
    });

  it("leaves no answerer in any question type, and keeps who a person question picked", () => {
    const report = JSON.stringify(withoutNames(named([1, 2, 3])));
    expect(report).not.toMatch(/"U\d"/);
    expect(report).toContain("UPICKED");
    expect(report).toContain("Riga");
  });

  it("says nothing about who answered first", () => {
    expect(withoutNames(named([3, 1, 2]))).toEqual(withoutNames(named([1, 2, 3])));
  });
});
