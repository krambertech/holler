#!/usr/bin/env node

// Run after `pnpm build`. The production product bundle must carry no developer tools, and the
// public site must carry no product code. A dev-only page that leaks into production fails here.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.(js|html|css)$/.test(name)) out.push(path);
  }
  return out;
}

const rules = [
  {
    dir: "apps/web/dist/client",
    forbidden: ["/api/dev/sign-in", "Holler design system", "holler-dev-persona-password"],
    why: "a developer tool reached the production product bundle",
  },
  {
    dir: "apps/site/dist",
    forbidden: ["/api/hollers", "better-auth"],
    why: "product code reached the public site",
  },
];

const problems = [];
for (const rule of rules) {
  let files;
  try {
    files = filesUnder(resolve(root, rule.dir));
  } catch {
    problems.push(`${rule.dir} does not exist: run pnpm build first`);
    continue;
  }
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const needle of rule.forbidden)
      if (text.includes(needle))
        problems.push(`${file.slice(root.length + 1)} contains "${needle}": ${rule.why}`);
  }
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  "check-boundaries: no developer tools in the product bundle, no product code on the site",
);
