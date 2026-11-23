import { testRule } from "../test/run.mjs";

const filename = "home.spec.ts";
const inTest = (body) => `test("a lead sends", async ({ page }) => { ${body} });`;

testRule("no-flaky-escape", {
  message:
    "A rerun, a skip or a sleep hides why a test fails. Find the cause, wait for the state you need " +
    "(a web-first assertion, waitForURL, a promise the test resolves), or delete the test and say why " +
    "in the pull request. A skip that depends on where it runs is test.skip(condition, reason).",
  valid: [
    { filename, code: inTest('await page.waitForURL("/settings");') },
    {
      filename,
      code: inTest(
        'test.skip(test.info().project.name !== "chromium", "WebKit has no clipboard");',
      ),
    },
    { filename, code: "const message = { ack: vi.fn(), retry: vi.fn() };" },
    { filename, code: 'expect(onlyAfter.skip).toBe(0); list.skip("a");' },
    { filename, code: 'vi.useFakeTimers({ toFake: ["Date"] });' },
    { filename: "vitest.config.ts", code: "export default { test: { testTimeout: 20_000 } };" },
  ],
  invalid: [
    { filename, code: inTest("await page.waitForTimeout(500);"), errors: ["waitForTimeout"] },
    { filename, code: 'test.skip("a lead sends", async () => {});', errors: ["skip"] },
    { filename, code: inTest("test.skip();"), errors: ["skip"] },
    { filename, code: inTest("test.skip(isWebKit);"), errors: ["skip"] },
    { filename, code: inTest('test.skip(isWebKit, "");'), errors: ["skip"] },
    { filename, code: inTest('test.skip(true, "Flaky on CI");'), errors: ["skip"] },
    { filename, code: inTest('test.info().skip(true, "Flaky on CI");'), errors: ["skip"] },
    { filename, code: 'it.skip("closes once", () => {});', errors: ["skip"] },
    { filename, code: 'describe.skip("closing", () => {});', errors: ["skip"] },
    { filename, code: 'test.describe.skip("closing", () => {});', errors: ["skip"] },
    { filename, code: 'it.skipIf(process.env.CI)("closes once", () => {});', errors: ["skipIf"] },
    { filename, code: 'it.only("closes once", () => {});', errors: ["only"] },
    { filename, code: 'test.describe.only("closing", () => {});', errors: ["only"] },
    { filename, code: 'test.fixme("a lead sends", async () => {});', errors: ["fixme"] },
    { filename, code: 'it.todo("closes once");', errors: ["todo"] },
    { filename, code: 'it["skip"]("closes once", () => {});', errors: ['"skip"'] },
    { filename, code: 'it("closes once", { retry: 3 }, () => {});', errors: ["retry"] },
    { filename, code: "test.describe.configure({ retries: 2 });", errors: ["retries"] },
    {
      filename,
      code: inTest("await new Promise((resolve) => setTimeout(resolve, 5));"),
      errors: ["setTimeout"],
    },
    {
      filename,
      code: 'import { setTimeout as sleep } from "node:timers/promises";',
      errors: ['"node:timers/promises"'],
    },
    {
      filename: "playwright.config.ts",
      code: "export default defineConfig({ retries: process.env.CI ? 1 : 0 });",
      errors: ["retries"],
    },
    {
      filename: "vitest.config.ts",
      code: "export default { test: { retry: 2 } };",
      errors: ["retry"],
    },
  ],
});
