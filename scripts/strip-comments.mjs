#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { commentsIn } from "./check-comments.mjs";

function kindOf(file) {
  return /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function isJsDoc(node) {
  return node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode;
}

function isEmptyJsx(node) {
  return node.kind === ts.SyntaxKind.JsxExpression && !node.expression;
}

export function codeOf(file, source) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kindOf(file));
  const tokens = [];
  const visit = (node) => {
    if (isJsDoc(node) || isEmptyJsx(node)) return;
    const children = node.getChildren(tree);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    const text = node.getText(tree).trim();
    if (!text) return;
    const gap = source.slice(node.getFullStart(), node.getStart(tree));
    const newLine = tokens.length > 0 && gap.includes("\n");
    tokens.push(`${newLine ? "\n" : ""}${text}`);
  };
  visit(tree);
  return tokens.join(" ");
}

function removed(text, start, end) {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const found = text.indexOf("\n", end);
  const lineEnd = found < 0 ? text.length : found;
  const before = text.slice(lineStart, start).trim();
  const after = text.slice(end, lineEnd).trim();
  if ((!before && !after) || (before === "{" && after === "}")) {
    return text.slice(0, lineStart) + text.slice(lineEnd + 1);
  }
  const gap = text.slice(start, end).includes("\n") ? "\n" : after ? " " : "";
  return text.slice(0, start).trimEnd() + gap + text.slice(end).replace(/^[ \t]+/, "");
}

export function strip(file, source) {
  let from = 0;
  const spans = commentsIn(file, source)
    .filter((comment) => !comment.directive)
    .map(({ text }) => {
      const at = source.indexOf(text, from);
      from = at + text.length;
      return [at, from];
    });
  return spans.reduceRight((text, [start, end]) => removed(text, start, end), source);
}

export function stripped(file, source) {
  const text = strip(file, source);
  return codeOf(file, text) === codeOf(file, source) ? text : null;
}

function main(files) {
  let failed = 0;
  for (const file of files) {
    const text = stripped(file, readFileSync(file, "utf8"));
    if (text === null) {
      console.error(`${file}: stripping would change code, so delete its comments by hand`);
      failed += 1;
    } else writeFileSync(file, text);
  }
  return failed > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
