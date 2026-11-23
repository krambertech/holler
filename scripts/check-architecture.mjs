#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { baseCommit, jsonAt } from "./base.mjs";

const root = resolve(import.meta.dirname, "..");
const MAP = "scripts/architecture.json";
const INTERNAL = /^(?:\.|@\/|@holler\/)/;
const SOURCE = /^(?:apps|packages)\/[^/]+\/src\//;
const TEST = /\.test\.tsx?$/;

const options = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true,
  allowImportingTsExtensions: true,
  paths: { "@/*": [resolve(root, "apps/web/src/client/*")] },
};
const cache = ts.createModuleResolutionCache(root, (name) => name, options);

function codeOf(file, text) {
  return file.endsWith(".astro") ? (/^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "") : text;
}

export function importsIn(file, text) {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, codeOf(file, text), ts.ScriptTarget.Latest, false, kind);
  const found = [];
  const add = (specifier, type) => {
    if (specifier && ts.isStringLiteral(specifier)) found.push({ from: specifier.text, type });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      add(node.moduleSpecifier, node.importClause?.isTypeOnly ?? false);
    } else if (ts.isExportDeclaration(node)) add(node.moduleSpecifier, node.isTypeOnly);
    else if (ts.isImportTypeNode(node)) add(node.argument.literal, true);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node.arguments[0], false);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

export function layerOf(layers, file) {
  let best = null;
  let length = -1;
  for (const layer of layers) {
    for (const prefix of layer.files) {
      if (prefix.length > length && file.startsWith(prefix)) {
        best = layer;
        length = prefix.length;
      }
    }
  }
  return best;
}

const named = ({ file, to }) => `${file} -> ${to}`;

export function layerProblems({ layers, exceptions }, edges) {
  const broken = new Map();
  for (const edge of edges) {
    if (TEST.test(edge.file)) continue;
    const from = layerOf(layers, edge.file);
    if (!from) continue;
    const to = layerOf(layers, edge.to);
    if (to === from || from.mayImport.includes(to?.name)) continue;
    if (edge.type && from.mayImportTypes?.includes(to?.name)) continue;
    broken.set(
      named(edge),
      `${named(edge)}: ${from.name} never imports ${to?.name ?? "what no layer owns"}. ${from.fix}`,
    );
  }
  return [
    ...[...broken].filter(([name]) => !exceptions.includes(name)).map(([, problem]) => problem),
    ...exceptions
      .filter((name) => !broken.has(name))
      .map((name) => `${name} is gone: delete it from "exceptions" in ${MAP}`),
  ];
}

export function homelessFiles(layers, files) {
  return files
    .filter((file) => SOURCE.test(file) && !layerOf(layers, file))
    .map((file) => `${file} belongs to no layer: add its folder to "layers" in ${MAP}`);
}

export function exceptionProblems(before, exceptions) {
  if (!before) return [];
  return exceptions
    .filter((name) => !before.includes(name))
    .map((name) => `${name}: "exceptions" in ${MAP} only gets shorter`);
}

export function cycles(edges) {
  const next = new Map();
  for (const { file, to, type } of edges) {
    if (!type && file !== to) next.set(file, [...(next.get(file) ?? []), to]);
  }
  const pathBack = (start) => {
    const before = new Map([[start, null]]);
    const queue = [start];
    for (const file of queue) {
      for (const to of next.get(file) ?? []) {
        if (to === start) {
          const path = [start];
          for (let at = file; at !== start; at = before.get(at)) path.splice(1, 0, at);
          return path;
        }
        if (!before.has(to)) {
          before.set(to, file);
          queue.push(to);
        }
      }
    }
    return null;
  };
  const found = new Map();
  for (const start of [...next.keys()].sort()) {
    const path = pathBack(start);
    const key = path?.toSorted().join(" ");
    if (path && !found.has(key)) found.set(key, [...path, start]);
  }
  return [...found.values()];
}

function trackedFiles() {
  return execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "apps",
      "packages",
      "e2e",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter((file) => /\.(tsx?|mjs|astro)$/.test(file) && !file.endsWith(".d.ts"));
}

function edgesOf(files) {
  return files.flatMap((file) => {
    const path = resolve(root, file);
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      return [];
    }
    return importsIn(file, text)
      .filter(({ from }) => INTERNAL.test(from))
      .flatMap(({ from, type }) => {
        const found = ts.resolveModuleName(from, path, options, ts.sys, cache).resolvedModule;
        const to = found && relative(root, found.resolvedFileName);
        return to && !to.startsWith("..") ? [{ file, to, type }] : [];
      });
  });
}

function main([base]) {
  const map = JSON.parse(readFileSync(resolve(root, MAP), "utf8"));
  const files = trackedFiles();
  const edges = edgesOf(files);
  const problems = [
    ...homelessFiles(map.layers, files),
    ...layerProblems(map, edges),
    ...exceptionProblems(jsonAt(baseCommit(base), MAP)?.exceptions, map.exceptions),
    ...cycles(edges).map(
      (path) =>
        `import cycle: ${path.join(" -> ")}. Move what both files need into a third file that imports neither.`,
    ),
  ];
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    console.error("\nAGENTS.md, Architecture. The layers are in scripts/architecture.json.");
    return 1;
  }
  console.log(
    `check-architecture: ${edges.length} imports keep to their layers, with no cycles and ${map.exceptions.length} recorded exception(s)`,
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
