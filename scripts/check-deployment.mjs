#!/usr/bin/env node

// Polls a Worker's /api/health until it names the expected worker and, when given, serves the
// expected version: a commit tag, or a version id (a preview alias reports no tag at runtime).
// A green deploy step is not proof the new version answers; this is.
// Usage: node scripts/check-deployment.mjs <origin> <worker> [tag-or-version-id] [attempts]

import { pathToFileURL } from "node:url";

/** Why this health answer is not the deployment we want, or null when it is. */
export function mismatch(health, worker, expected) {
  if (health?.ok !== true) return "no healthy answer";
  if (health.worker !== worker) return `answered as ${health.worker}, expected ${worker}`;
  if (expected && health.tag !== expected && health.version !== expected) {
    return `serves version ${health.version} tag ${health.tag || "none"}, expected ${expected}`;
  }
  return null;
}

export async function checkDeployment(origin, worker, tag, attempts = 20, wait = 3_000) {
  let last = "no answer";
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${origin}/api/health`, {
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(10_000),
      });
      const health = response.ok ? await response.json() : null;
      last = mismatch(health, worker, tag) ?? "";
      if (!last) return health;
    } catch (error) {
      last = error.message;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error(`${origin} is not ${worker}${tag ? ` at ${tag}` : ""}: ${last}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [origin, worker, tag, attempts] = process.argv.slice(2);
  if (!origin || !worker) {
    console.error("Usage: node scripts/check-deployment.mjs <origin> <worker> [tag-or-version-id] [attempts]");
    process.exit(1);
  }
  const health = await checkDeployment(
    origin.replace(/\/+$/, ""),
    worker,
    tag,
    Number(attempts ?? 20),
  );
  console.log(
    `${origin}: ${health.worker} version ${health.version}${health.tag ? ` tag ${health.tag}` : ""}`,
  );
}
