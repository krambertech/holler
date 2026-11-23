import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendEffects } from "../services/delivery";
import { knownWindows, postings } from "./known-windows";
import { Life } from "./life";
import { localD1s } from "./local-d1";
import { deliveries, operations } from "./scenarios";
import { postingOf, sweep, windowProblems } from "./sweep";

const SWEEP_TIMEOUT = 180_000;

let d1s: Awaited<ReturnType<typeof localD1s>>;
beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  d1s = await localD1s(5);
}, SWEEP_TIMEOUT);
afterAll(() => d1s.close());

describe.concurrent("a Worker that dies partway through", () => {
  it.each(operations)(
    "$operation",
    async (scenario) => {
      const runs = await d1s.borrow((d1) => sweep(d1, scenario));
      expect(windowProblems(scenario.operation, runs, knownWindows)).toEqual([]);
    },
    SWEEP_TIMEOUT,
  );

  it.each(deliveries)(
    "$operation",
    async (scenario) => {
      const { kind, operation } = scenario;
      const runs = await d1s.borrow((d1) => sweep(d1, scenario));
      expect(windowProblems(operation, runs, knownWindows)).toEqual([]);
      if (sendEffects[kind] === "posts") expect(postingOf(kind, runs)).toBe(postings[kind]);
    },
    SWEEP_TIMEOUT,
  );
});

describe("the sweep", () => {
  it("delivers every kind of send", () => {
    expect(deliveries.map(({ kind }) => kind).sort()).toEqual(Object.keys(sendEffects).sort());
  });

  it("lists windows only for operations it runs", () => {
    const swept = [...operations, ...deliveries].map(({ operation }) => operation);
    expect(knownWindows.filter(({ operation }) => !swept.includes(operation))).toEqual([]);
  });

  it("calls a window a trade-off only between a post's claim and its stored result", () => {
    const traded = knownWindows.filter(({ tradeOff }) => tradeOff);
    for (const { operation, failure } of traded) {
      expect(operation).toMatch(/^deliver /);
      expect(failure).toMatch(/^killed after (insert slack deliveries|Slack posts \w+)$/);
    }
  });

  it("names the function, the step it failed at and the fix when a window opens", () => {
    const run = { failure: "killed after x", ending: "killed", writes: [], posted: [] } as const;
    const opened = windowProblems("send", [{ ...run, broken: ["invited"] }] as never, []);
    expect(opened).toEqual([
      "New crash window in send. Failure: killed after x. Broken: every recipient of a live Holler gets it. Fix: derive this work from stored state in a cron pass, or write it in the same batch.",
    ]);
  });

  it("tells apart two writes with the same label", async () => {
    const life = new Life();
    const write = { label: "insert recipients", writes: true };
    for (const _ of [1, 2])
      await life.step(
        write,
        async () => {},
        () => new Error("refused"),
      );
    expect(life.writes).toEqual(["insert recipients", "insert recipients #2"]);
  });

  it("asks for the line of a window that closed", () => {
    const known = { operation: "send", failure: "killed after x", breaks: ["invited" as const] };
    expect(windowProblems("send", [], [known])).toEqual([
      "Crash window closed in send. Delete its line from known-windows.ts: killed after x | invited",
    ]);
  });
});
