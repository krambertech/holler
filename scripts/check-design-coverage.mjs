#!/usr/bin/env node

// Every component in apps/web/src/client/components has a page on the design site. Fails when an
// exported component is not named by an entry in src/client/design/parts/*.tsx (its `name`, which
// may list several, comma-separated) or by a foundation's `covers` in registry.ts.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { exportedNames } from "./exports.mjs";

const root = resolve(import.meta.dirname, "..");
const client = resolve(root, "apps/web/src/client");

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** PascalCase values exported from a component file: its components, not its types or helpers. */
export function exportedComponents(source) {
  return exportedNames(source, { types: false }).filter((name) => /^[A-Z]/.test(name));
}

/**
 * A part is covered by its family: DialogContent by Dialog, ComboboxItem by Combobox. Providers and
 * parts that only exist inside a documented family need no page of their own.
 */
export function isCovered(name, documented) {
  if (documented.has(name)) return true;
  return [...documented].some(
    (family) =>
      family.length >= 4 && name.startsWith(family) && /^[A-Z]/.test(name.slice(family.length)),
  );
}

/** Names the design site documents: entry names and foundation `covers`. */
export function documentedNames(sources) {
  const names = new Set();
  for (const source of sources) {
    for (const m of source.matchAll(/\bname:\s*"([^"]+)"/g))
      for (const name of m[1].split(",")) names.add(name.trim());
    for (const m of source.matchAll(/covers:\s*\[([^\]]*)\]/g))
      for (const name of m[1].matchAll(/"([^"]+)"/g)) names.add(name[1]);
  }
  return names;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const components = walk(resolve(client, "components")).filter(
    (p) => p.endsWith(".tsx") && !p.endsWith(".test.tsx"),
  );
  const docs = [...walk(resolve(client, "design/parts")), resolve(client, "design/registry.ts")];
  const documented = documentedNames(docs.map((p) => readFileSync(p, "utf8")));
  const missing = [];
  for (const file of components)
    for (const name of exportedComponents(readFileSync(file, "utf8")))
      if (!isCovered(name, documented))
        missing.push(`${file.slice(root.length + 1)}: ${name} has no page on the design site`);
  if (missing.length > 0) {
    console.error(
      `${missing.join("\n")}\n\nAdd an entry for it in apps/web/src/client/design/parts/.`,
    );
    process.exit(1);
  }
  console.log(
    `check-design-coverage: all ${documented.size} documented names cover every exported component`,
  );
}
