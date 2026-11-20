import { describe, expect, it } from "vitest";
import { anonymousThreshold, anonymousTime, type ResultsQuestion, summarize } from "./results";

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
    if (!q || q.type === "text") throw new Error("expected a choice question");
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
});
