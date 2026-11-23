import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function baseCommit(given) {
  const base = given ?? (process.env.BASE_SHA || git(["merge-base", "origin/main", "HEAD"]));
  if (!base && process.env.CI) {
    throw new Error("There is no base commit to compare with. Check out with fetch-depth: 0.");
  }
  return base || null;
}

export function jsonAt(commit, file) {
  const text = commit && git(["show", `${commit}:${file}`]);
  return text ? JSON.parse(text) : null;
}
