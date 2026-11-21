import assert from "node:assert/strict";
import { test } from "node:test";
import { lastVersionId } from "./wrangler-version.mjs";

const line = (entry) => JSON.stringify(entry);

test("reads the last upload's version id", () => {
  const jsonl = [
    line({ type: "wrangler-session", version: 1 }),
    line({ type: "deploy", version_id: "first" }),
    line({ type: "version-upload", version_id: "second", preview_url: "https://x" }),
  ].join("\n");
  assert.equal(lastVersionId(jsonl), "second");
});

test("fails loudly when nothing was uploaded", () => {
  assert.throws(() => lastVersionId(line({ type: "wrangler-session" })), /no deploy or upload/);
});
