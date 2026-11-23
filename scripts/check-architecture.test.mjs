import assert from "node:assert/strict";
import test from "node:test";
import {
  cycles,
  exceptionProblems,
  homelessFiles,
  importsIn,
  layerOf,
  layerProblems,
} from "./check-architecture.mjs";

const layers = [
  { name: "server", files: ["server/"], mayImport: ["services"], fix: "Share it." },
  {
    name: "services",
    files: ["server/services/"],
    mayImport: [],
    mayImportTypes: ["server"],
    fix: "Move it down.",
  },
];
const edge = (file, to, type = false) => ({ file, to, type });

test("reads static, dynamic, re-exported and type imports", () => {
  const source = `
    import a, { type B } from "./a";
    import type { C } from "./c";
    export * from "./d";
    const later = () => import("./e");
    type F = import("./f").F;
  `;
  assert.deepEqual(importsIn("x.ts", source), [
    { from: "./a", type: false },
    { from: "./c", type: true },
    { from: "./d", type: false },
    { from: "./e", type: false },
    { from: "./f", type: true },
  ]);
});

test("reads an Astro file's frontmatter only", () => {
  const source = `---\nimport { mark } from "@holler/design";\n---\n<p>import x from "./x"</p>`;
  assert.deepEqual(importsIn("a.astro", source), [{ from: "@holler/design", type: false }]);
});

test("puts a file in the layer with the longest matching folder", () => {
  assert.equal(layerOf(layers, "server/services/a.ts").name, "services");
  assert.equal(layerOf(layers, "server/app.ts").name, "server");
  assert.deepEqual(homelessFiles(layers, ["packages/new/src/a.ts"]).length, 1);
});

test("refuses an import up a layer and names the fix", () => {
  const map = { layers, exceptions: [] };
  const [problem] = layerProblems(map, [edge("server/services/a.ts", "server/app.ts")]);
  assert.match(problem, /services never imports server\. Move it down\./);
  assert.deepEqual(layerProblems(map, [edge("server/services/a.ts", "server/app.ts", true)]), []);
  assert.deepEqual(layerProblems(map, [edge("server/app.ts", "server/services/a.ts")]), []);
  assert.deepEqual(layerProblems(map, [edge("server/services/a.test.ts", "server/app.ts")]), []);
});

test("keeps an exception only while it is needed, and never a new one", () => {
  const exceptions = ["server/services/a.ts -> server/app.ts"];
  const broken = [edge("server/services/a.ts", "server/app.ts")];
  assert.deepEqual(layerProblems({ layers, exceptions }, broken), []);
  assert.match(layerProblems({ layers, exceptions }, [])[0], /is gone: delete it/);
  assert.match(exceptionProblems([], exceptions)[0], /only gets shorter/);
  assert.deepEqual(exceptionProblems(exceptions, []), []);
  assert.deepEqual(exceptionProblems(undefined, exceptions), []);
});

test("finds each cycle once and ignores types", () => {
  const edges = [
    edge("a", "b"),
    edge("b", "c"),
    edge("c", "a"),
    edge("c", "d"),
    edge("d", "c", true),
  ];
  assert.deepEqual(cycles(edges), [["a", "b", "c", "a"]]);
  assert.deepEqual(cycles([edge("a", "b"), edge("b", "a", true)]), []);
});
