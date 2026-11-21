import { describe, expect, it } from "vitest";
import { answerSurface, hollerTitle } from "./surfaces";

const single = (count: number) => ({
  type: "single" as const,
  style: "plain" as const,
  options: Array.from({ length: count }, (_, i) => ({ label: String(i) })),
});

describe("answerSurface", () => {
  it("answers a one-question choice pulse right in the DM", () => {
    expect(answerSurface({ mode: "pulse", questions: [single(3)] })).toEqual({ where: "dm" });
  });

  it("answers a one-question free-text pulse in the DM", () => {
    const text = { type: "text" as const, style: "plain" as const, options: [] };
    expect(answerSurface({ mode: "pulse", questions: [text] }).where).toBe("dm");
  });

  it("opens a Slack form for a pulse with Other, too many buttons or two questions", () => {
    expect(
      answerSurface({ mode: "pulse", questions: [{ ...single(3), allowOther: true }] }).where,
    ).toBe("slack");
    expect(answerSurface({ mode: "pulse", questions: [single(26)] }).where).toBe("slack");
    expect(answerSurface({ mode: "pulse", questions: [single(2), single(2)] }).where).toBe("slack");
  });

  it("names the question that needs the web form", () => {
    const conditional = { ...single(3), followUp: { onlyAfter: [1] } };
    expect(answerSurface({ mode: "survey", questions: [single(2), conditional] })).toEqual({
      where: "web",
      question: 1,
      why: "conditional_follow_up",
    });
    expect(answerSurface({ mode: "survey", questions: [single(101)] })).toMatchObject({
      where: "web",
      why: "too_many_options",
    });
  });

  it("keeps a follow-up after any answer in Slack", () => {
    const anyAnswer = { ...single(3), followUp: { onlyAfter: null } };
    expect(answerSurface({ mode: "pulse", questions: [anyAnswer] }).where).toBe("dm");
  });

  it("treats a chase as a chase", () => {
    expect(answerSurface({ mode: "chase", questions: [] }).where).toBe("chase");
  });
});

describe("hollerTitle", () => {
  it("uses a pulse's first question when it has no title", () => {
    expect(hollerTitle({ mode: "pulse", title: " ", questions: [{ prompt: "How was it?" }] })).toBe(
      "How was it?",
    );
    expect(hollerTitle({ mode: "survey", title: "", questions: [{ prompt: "How was it?" }] })).toBe(
      "",
    );
    expect(hollerTitle({ mode: "pulse", title: "Weekly", questions: [{ prompt: "How?" }] })).toBe(
      "Weekly",
    );
  });
});
