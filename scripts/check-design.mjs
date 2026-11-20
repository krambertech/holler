#!/usr/bin/env node

// Keeps DESIGN.md true to the code. Fails when its colour frontmatter drifts from
// packages/design/tokens.css, when an app's styles stop importing the tokens or redeclare a theme,
// or when DESIGN.md names a component in code font that nothing exports.
// `--write` rewrites the frontmatter colours from tokens.css.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { palette } from "../packages/design/scripts/colour.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

export function frontmatterColours(markdown) {
  const section = markdown.match(/^colors:\n((?: {2}.+\n)+)/m);
  if (!section) throw new Error("DESIGN.md has no colors: frontmatter");
  return {
    text: section[0],
    entries: [...section[1].matchAll(/^ {2}([a-z0-9-]+): "(#[0-9a-f]+)"$/gm)].map((m) => [
      m[1],
      m[2],
    ]),
  };
}

/** PascalCase names in code font outside fenced blocks: `Plate`, `HollerRow`. */
export function namedComponents(markdown) {
  const prose = markdown.replace(/^```[\s\S]*?^```/gm, "");
  return [...prose.matchAll(/`([A-Z][a-z]+[A-Za-z]*)`/g)].map((m) => m[1]);
}

function exportedNames() {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(path);
      } else if (/\.(tsx?|astro)$/.test(entry.name)) {
        const source = read(path);
        for (const m of source.matchAll(
          /export\s+(?:default\s+)?(?:const|function|class|type|interface)\s+([A-Z]\w*)/g,
        ))
          names.add(m[1]);
        if (entry.name.endsWith(".astro")) names.add(entry.name.replace(".astro", ""));
      }
    }
  };
  for (const dir of ["apps/web/src", "apps/site/src", "packages/core/src", "packages/design/src"])
    walk(dir);
  return names;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const css = read("packages/design/tokens.css");
  const colours = palette(css);
  const design = read("DESIGN.md");
  const current = frontmatterColours(design);
  const problems = [];

  if (process.argv.includes("--write")) {
    const text = `colors:\n${colours.map(([name, hex]) => `  ${name}: "${hex}"`).join("\n")}\n`;
    writeFileSync(resolve(root, "DESIGN.md"), design.replace(current.text, text));
    console.log(`DESIGN.md: wrote ${colours.length} colours from packages/design/tokens.css`);
  } else if (JSON.stringify(current.entries) !== JSON.stringify(colours)) {
    const want = new Map(colours);
    const have = new Map(current.entries);
    for (const [name, hex] of want)
      if (have.get(name) !== hex)
        problems.push(
          `DESIGN.md colors.${name} is ${have.get(name) ?? "missing"}, tokens.css gives ${hex}`,
        );
    for (const name of have.keys())
      if (!want.has(name)) problems.push(`DESIGN.md colors.${name} has no token in tokens.css`);
    if (problems.length === 0) problems.push("DESIGN.md colors are out of order with tokens.css");
  }

  for (const path of ["apps/web/src/client/styles.css", "apps/site/src/styles.css"]) {
    const styles = read(path);
    if (!styles.includes('@import "@holler/design/tokens.css";'))
      problems.push(`${path} does not import @holler/design/tokens.css`);
    for (const selector of [":root", '[data-theme="dark"]', '[data-theme="light"]', "@theme"])
      if (styles.includes(`${selector} {`))
        problems.push(`${path} declares ${selector}, which packages/design/tokens.css owns`);
  }

  const exported = exportedNames();
  for (const name of new Set(namedComponents(design)))
    if (!exported.has(name)) problems.push(`DESIGN.md names \`${name}\`, which nothing exports`);

  if (problems.length > 0) {
    console.error(
      `${problems.join("\n")}\n\nRun \`node scripts/check-design.mjs --write\` for colours; fix the rest by hand.`,
    );
    process.exit(1);
  }
  console.log(
    `check-design: DESIGN.md matches ${colours.length} tokens and every named component exists`,
  );
}
