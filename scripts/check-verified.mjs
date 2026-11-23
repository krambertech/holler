#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const vague = /^(yes|done|ok|tested|manually|locally|n\/a|tbd|todo)\.?$/i;

export function verifiedProblem(body) {
  const said = (body ?? "").match(/^Verified:[ \t]*(.*)$/m)?.[1]?.trim();
  if (!said) {
    return 'The description has no "Verified:" line. Say what ran, such as "Verified: pnpm verify; drove home and answers, evidence in verify/2026-11-23", or "Verified: none, because …"';
  }
  if (vague.test(said))
    return `"Verified: ${said}" names nothing that ran. Name the commands or the evidence`;
  if (/^none\b/i.test(said) && !/^none, because \S+/i.test(said)) {
    return 'Write "Verified: none, because …" with the reason';
  }
  return null;
}

function main() {
  const problem = verifiedProblem(process.env.PR_BODY);
  if (!problem) {
    console.log("check-verified: the description says how the change was verified");
    return 0;
  }
  if (process.env.MODE === "observe") {
    console.log(`::warning::${problem}`);
    return 0;
  }
  console.error(problem);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
