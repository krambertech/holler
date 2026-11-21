#!/usr/bin/env node

// Drive features from the map on a running instance and keep the evidence. See ../SKILL.md.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, stripVTControlCharacters } from "node:util";
import { chromium, devices, expect } from "@playwright/test";
import { doctor, git, report } from "./doctor.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const featuresDir = resolve(here, "../features");
const features = readdirSync(featuresDir)
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => f.slice(0, -4));

const HELP = `Usage: node .agents/skills/verify/scripts/run.mjs <feature...> [options]

Features: ${features.join(", ")}

  --url <origin>     Instance to drive (default: http://localhost:5280)
  --sha <commit>     Commit the instance should serve (default: HEAD of this worktree)
  --version <id>     Worker version a preview should serve, from its CI job summary
  --key <key>        A preview's DEV_ROUTES_KEY (default: $HOLLER_DEV_KEY)
  --pr <n>           Pull request the evidence belongs to (default: the branch name)
  --out <dir>        Evidence root (default: $HOLLER_EVIDENCE_DIR, else the temp dir)
  --phone            Drive at 375 px with touch instead of 1280 px with a pointer
  --dark             Drive in night (prefers-color-scheme: dark)
  --headed           Show the browser
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string", default: "http://localhost:5280" },
    sha: { type: "string" },
    key: { type: "string" },
    version: { type: "string" },
    pr: { type: "string" },
    out: { type: "string" },
    phone: { type: "boolean", default: false },
    dark: { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

const unknown = positionals.filter((f) => !features.includes(f));
if (values.help || positionals.length === 0 || unknown.length > 0) {
  if (unknown.length > 0) process.stderr.write(`Not in the map: ${unknown.join(", ")}\n\n`);
  process.stdout.write(HELP);
  process.exit(values.help ? 0 : 1);
}

const base = values.url.replace(/\/+$/, "");
const sha = values.sha ?? git(["rev-parse", "HEAD"]);
const where = ["localhost", "127.0.0.1"].includes(new URL(base).hostname)
  ? "local"
  : new URL(base).hostname.split(".")[0];
const owner = values.pr
  ? `pr-${values.pr}`
  : (git(["branch", "--show-current"]) ?? "detached").replaceAll("/", "-");
const root = values.out ?? process.env.HOLLER_EVIDENCE_DIR ?? join(tmpdir(), "holler-evidence");
const viewport = values.phone
  ? { ...devices["iPhone 13 mini"], viewport: { width: 375, height: 812 } }
  : { viewport: { width: 1280, height: 900 } };
const variant = `${values.phone ? "-phone" : ""}${values.dark ? "-night" : ""}`;

const key = values.key ?? process.env.HOLLER_DEV_KEY;
const devHeaders = key ? { "x-holler-dev-key": key } : undefined;

const patient = expect.configure({ timeout: 15_000 });

function failure(error) {
  return stripVTControlCharacters(error.message).split("\n").slice(0, 6).join("\n");
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function driveFeature(browser, name) {
  const feature = await import(join(featuresDir, `${name}.mjs`));
  const persona = feature.persona ?? "lead";
  const dir = join(root, owner, `${name}-${where}${variant}-${sha.slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });

  const context = await browser.newContext({
    ...viewport,
    baseURL: base,
    reducedMotion: "reduce",
    colorScheme: values.dark ? "dark" : "light",
    extraHTTPHeaders: devHeaders,
  });
  // A dev server compiles each route on first visit, so waits allow for a cold start.
  context.setDefaultTimeout(15_000);
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const at = m.location().url;
    problems.push(at ? `console: ${m.text()} (${at})` : `console: ${m.text()}`);
  });
  page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));

  const api = async (path) => {
    const response = await page.request.get(`${base}${path}`);
    if (!response.ok()) throw new Error(`GET ${path} answered HTTP ${response.status()}`);
    return response.json();
  };
  const post = async (path, data) => {
    const response = await page.request.post(`${base}${path}`, { data });
    if (!response.ok()) {
      throw new Error(`POST ${path} answered HTTP ${response.status()}: ${await response.text()}`);
    }
    return response.json();
  };

  const steps = [];
  const step = async (action, run) => {
    const n = String(steps.length + 1).padStart(2, "0");
    const prefix = `${n}-${slug(action)}`;
    const record = { action, ok: true, files: [] };
    steps.push(record);
    try {
      record.stored = (await run()) ?? null;
    } catch (error) {
      record.ok = false;
      record.error = failure(error);
    }
    await page.screenshot({ path: join(dir, `${prefix}.png`) }).catch(() => {});
    const aria = await page
      .locator("main")
      .first()
      .ariaSnapshot({ timeout: 5_000 })
      .catch(() => null);
    if (aria) writeFileSync(join(dir, `${prefix}.aria.yml`), aria);
    const devState = await api("/api/dev/state").catch((e) => ({ error: e.message }));
    writeFileSync(
      join(dir, `${prefix}.state.json`),
      `${JSON.stringify({ devState, stored: record.stored }, null, 2)}\n`,
    );
    record.files = [`${prefix}.png`, aria ? `${prefix}.aria.yml` : null, `${prefix}.state.json`];
    if (!record.ok) throw Object.assign(new Error(record.error), { recorded: true });
  };

  let checks = [];
  try {
    const signIn = `/api/dev/sign-in?as=${persona}&reset=1&to=${encodeURIComponent(feature.start ?? "/")}`;
    await page.goto(`${base}${signIn}`);
    // The first load after a cold start waits for Vite to bundle the dependencies.
    await page.getByRole("main").first().waitFor({ timeout: 90_000 });
    const cookie = (await context.cookies(base)).map((c) => `${c.name}=${c.value}`).join("; ");
    checks = await doctor({ url: base, sha, version: values.version, persona, cookie, key });
    if (!report(checks)) throw new Error("the doctor found this instance not worth driving");
    await feature.default({ page, base, step, api, post, expect: patient });
  } catch (error) {
    if (!error.recorded)
      steps.push({ action: "set up", ok: false, error: failure(error), files: [] });
  } finally {
    await context.close();
  }

  const ok = steps.length > 0 && steps.every((s) => s.ok);
  const size = values.phone ? "375 px touch" : "1280 px pointer";
  const lines = [
    `# ${feature.title ?? name}: ${ok ? "PASS" : "FAIL"}`,
    "",
    `${base} as ${persona}, ${size}, ${values.dark ? "night" : "day"}, ${new Date().toISOString()}`,
    "",
    ...checks.map((c) => `- Doctor ${c.name}: ${c.ok ? "ok" : "FAIL"}, ${c.detail}`),
    "",
    ...steps.flatMap((s, i) => [
      `${i + 1}. ${s.ok ? "ok" : "FAIL"} ${s.action}${s.files.length ? ` (${s.files.filter(Boolean).join(", ")})` : ""}`,
      ...(s.error
        ? ["", "   ```text", ...s.error.split("\n").map((l) => `   ${l}`), "   ```"]
        : []),
    ]),
    "",
    problems.length ? "Console and network:" : "No console errors or server failures.",
    ...problems.map((p) => `- ${p}`),
    "",
  ];
  writeFileSync(join(dir, "verdict.md"), lines.join("\n"));
  process.stdout.write(`${ok ? "PASS" : "FAIL"} ${name}  ${dir}\n`);
  return ok;
}

const browser = await chromium.launch({ headless: !values.headed });
let passed = true;
try {
  for (const name of positionals) passed = (await driveFeature(browser, name)) && passed;
} finally {
  await browser.close();
}
process.exitCode = passed ? 0 : 1;
