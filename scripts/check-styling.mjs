#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SCOPE = ["apps/web/src/client", "apps/site/src"];
const CHECKED = /\.(tsx?|astro|css|mdx)$/;
const SKIPPED = /\.(test|gen)\./;
/** Put this on the line, or the line above, for a colour that is not Holler's, such as Slack's own grey. */
export const ALLOW = "check-styling: allow";

const STOCK =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITY =
  "bg|text|border|ring|ring-offset|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide|placeholder";
const LOGICAL = {
  ml: "ms",
  mr: "me",
  pl: "ps",
  pr: "pe",
  left: "start",
  right: "end",
  "border-l": "border-s",
  "border-r": "border-e",
  "rounded-l": "rounded-s",
  "rounded-r": "rounded-e",
  "rounded-tl": "rounded-ss",
  "rounded-tr": "rounded-se",
  "rounded-bl": "rounded-es",
  "rounded-br": "rounded-ee",
  "scroll-ml": "scroll-ms",
  "scroll-mr": "scroll-me",
  "scroll-pl": "scroll-ps",
  "scroll-pr": "scroll-pe",
  "text-left": "text-start",
  "text-right": "text-end",
  "float-left": "float-start",
  "float-right": "float-end",
};
const CSS = {
  "margin-left": "margin-inline-start",
  "margin-right": "margin-inline-end",
  "padding-left": "padding-inline-start",
  "padding-right": "padding-inline-end",
  "border-left": "border-inline-start",
  "border-right": "border-inline-end",
  left: "inset-inline-start",
  right: "inset-inline-end",
};

const prefixes = Object.keys(LOGICAL)
  .sort((a, b) => b.length - a.length)
  .join("|");
const classStart = String.raw`(?<=^|[\s"'\`:!{(])-?`;
const bare = prefixes
  .split("|")
  .filter((prefix) => prefix.includes("-"))
  .join("|");
const physicalClass = new RegExp(
  String.raw`${classStart}(?:(${prefixes})-(?!1\/2\b)(?:\d[\w.\/]*|\[[^\]\s]*\]?|\([^)\s]*\)?|(?:px|auto|full|screen|none|xs|sm|md|lg|\d?xl)\b)|(${bare})(?=[\s"'\`)}]|$))`,
  "g",
);
const stockColour = new RegExp(
  String.raw`${classStart}(?:${UTILITY})-(?:(?:${STOCK})-\d{2,3}|white|black)\b`,
  "g",
);
const rawHex = /(?<=["'`[]|:\s*)#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;
// `left: 50%` centres rather than leans.
const centred = /^\s*["'`]?-?50%/;
const cssProp = new RegExp(
  String.raw`(?<![\w-])(${Object.keys(CSS).join("|")})(?:-(?:width|color|style))?\s*:(?!:)`,
  "g",
);
const cssText = /\.(css|astro)$/;
// An in-page link such as href="#add" is spelled in hex letters too.
const anchor = /(?:href|to|hash|id)\s*(?:={1,3}|:)\s*["'`]?$/;

export function problemsIn(file, line) {
  const problems = [];
  for (const { 0: hex, index } of line.matchAll(rawHex)) {
    if (anchor.test(line.slice(0, index))) continue;
    problems.push(
      `raw colour ${hex}: use a Holler token such as bg-plate or text-ink-2; dark mode is its own palette, not an inversion`,
    );
  }
  for (const [stock] of line.matchAll(stockColour)) {
    problems.push(
      `stock Tailwind colour ${stock}: use a Holler token from packages/design/tokens.css`,
    );
  }
  for (const match of line.matchAll(physicalClass)) {
    const [found, prefix = match[2]] = match;
    problems.push(`physical ${found}: use ${found.replace(prefix, LOGICAL[prefix])}`);
  }
  if (cssText.test(file)) {
    for (const { 0: found, 1: prop, index } of line.matchAll(cssProp)) {
      if (!prop.includes("-") && !file.endsWith(".css")) continue;
      if (centred.test(line.slice(index + found.length))) continue;
      problems.push(
        `physical ${found.replace(/\s*:$/, "")}: use ${found.replace(prop, CSS[prop]).replace(/\s*:$/, "")}`,
      );
    }
  }
  return problems;
}

export function check(files) {
  const found = [];
  for (const { file, text } of files) {
    let previous = "";
    for (const [at, line] of text.split("\n").entries()) {
      if (!line.includes(ALLOW) && !previous.includes(ALLOW)) {
        for (const problem of problemsIn(file, line)) found.push(`${file}:${at + 1}: ${problem}`);
      }
      previous = line;
    }
  }
  return found;
}

function filesUnder(dir) {
  return readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && CHECKED.test(entry.name) && !SKIPPED.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = SCOPE.flatMap(filesUnder).map((path) => ({
    file: relative(root, path),
    text: readFileSync(path, "utf8"),
  }));
  const found = check(files);
  if (found.length > 0) {
    console.error(found.join("\n"));
    console.error(
      `\nAGENTS.md, Styling. For a colour that is not Holler's, such as Slack's own grey, add "${ALLOW}: <reason>" in a comment on or above the line.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`check-styling: ${files.length} files use Holler tokens and logical directions`);
  }
}
