import { describe, expect, it } from "vitest";
import { readInChunks } from "./batch";

const D1_BOUND_VALUES_PER_STATEMENT = 100;

describe("readInChunks", () => {
  it("reads each value once, in lists D1 can bind", async () => {
    const seen: string[][] = [];
    const values = Array.from({ length: 200 }, (_, i) => `v${i % 150}`);
    const rows = await readInChunks(values, async (chunk) => {
      seen.push(chunk);
      return chunk;
    });
    expect(seen.every((chunk) => chunk.length < D1_BOUND_VALUES_PER_STATEMENT)).toBe(true);
    expect(rows).toHaveLength(150);
    expect(new Set(rows).size).toBe(150);
  });

  it("returns more rows than a call can take as arguments", async () => {
    const rows = await readInChunks(["a"], async () =>
      Array.from({ length: 300_000 }, (_, i) => i),
    );
    expect(rows).toHaveLength(300_000);
  });
});
