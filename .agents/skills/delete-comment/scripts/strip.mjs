#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { commentsIn } from "../../../../scripts/check-comments.mjs";

function kindOf(file) {
  return /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

export function tokensOf(file, source) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kindOf(file));
  const tokens = [];
  const visit = (node) => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) {
      return;
    }
    const children = node.getChildren(tree);
    if (children.length === 0) tokens.push(node.getText(tree).trim());
    for (const child of children) visit(child);
  };
  visit(tree);
  return tokens.filter(Boolean);
}

export function strip(file, source) {
  let text = source;
  const comments = commentsIn(file, source).filter((comment) => !comment.directive);
  let from = 0;
  const spans = comments.map((comment) => {
    const at = source.indexOf(comment.text, from);
    from = at + comment.text.length;
    return [at, from];
  });
  for (const [start, end] of spans.reverse()) {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = text.indexOf("\n", end);
    const before = text.slice(lineStart, start);
    const after = text.slice(end, lineEnd < 0 ? text.length : lineEnd);
    const alone = before.trim() === "" && after.trim() === "";
    const jsx = before.trim() === "{" && after.trim() === "}";
    if (alone || jsx) text = text.slice(0, lineStart) + text.slice(lineEnd + 1);
    else
      text = `${text.slice(0, start).trimEnd()}${after.trim() ? " " : ""}${text.slice(end).trimStart() === text.slice(end) ? text.slice(end) : text.slice(end).replace(/^[ \t]+/, "")}`;
  }
  return text;
}

if (process.argv[1]?.endsWith("strip.mjs")) {
  let failed = 0;
  for (const file of process.argv.slice(2)) {
    const source = readFileSync(file, "utf8");
    const text = strip(file, source);
    const same = (a) =>
      tokensOf(file, a)
        .filter((token) => token !== "{}")
        .join(" ");
    if (same(text) !== same(source)) {
      console.error(`${file}: stripping would change code; delete its comments by hand`);
      failed += 1;
      continue;
    }
    writeFileSync(file, text);
  }
  process.exitCode = failed > 0 ? 1 : 0;
}
