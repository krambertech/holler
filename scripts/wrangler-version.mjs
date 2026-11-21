#!/usr/bin/env node

// Prints the version id of the last deploy or upload Wrangler recorded in its output file
// (WRANGLER_OUTPUT_FILE_PATH), so CI can check that exact version answers.
// Usage: node scripts/wrangler-version.mjs <output.jsonl>

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function lastVersionId(jsonl) {
  const ids = jsonl
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
    .filter((entry) => ["deploy", "version-upload"].includes(entry.type) && entry.version_id)
    .map((entry) => entry.version_id);
  const id = ids.at(-1);
  if (!id) throw new Error("Wrangler recorded no deploy or upload with a version id");
  return id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(lastVersionId(readFileSync(process.argv[2], "utf8")));
}
