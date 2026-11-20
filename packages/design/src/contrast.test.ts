import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { block, contrast, DARK, OS_DARK, parse, themes } from "../scripts/colour.mjs";
import { pairs } from "./pairs";

const css = readFileSync(resolve(import.meta.dirname, "../tokens.css"), "utf8");
const { light, dark } = themes(css);

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_, vars) => {
  it.each(pairs.map((pair) => [`${pair.text} on ${pair.on}`, pair] as const))(
    "%s meets its floor",
    (_, pair) => {
      const text = parse(`var(--${pair.text})`, vars);
      const surface = parse(`var(--${pair.on})`, vars);
      if (!text || !surface) throw new Error(`${pair.text} or ${pair.on} is not a colour`);
      expect(contrast(text, surface)).toBeGreaterThanOrEqual(pair.min);
    },
  );
});

describe("the OS dark block", () => {
  it("matches the [data-theme=dark] block token for token", () => {
    expect(block(css, OS_DARK)).toEqual(block(css, DARK));
  });
});
