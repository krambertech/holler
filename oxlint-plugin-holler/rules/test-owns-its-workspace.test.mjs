import { testRule } from "../test/run.mjs";

const filename = "settings.spec.ts";

testRule("test-owns-its-workspace", {
  message:
    "Each browser test has its own workspace. What a beforeAll makes, or a serial run leaves behind, is " +
    "shared between tests. Make it in beforeEach or in the test: signInAs(page, persona) and the " +
    "requestAs fixture from e2e/fixtures.ts both use the test's own workspace.",
  valid: [
    {
      filename,
      code: 'test.beforeEach(async ({ requestAs }) => { lead = await requestAs("lead"); });',
    },
    { filename, code: 'test.describe.configure({ mode: "default" });' },
  ],
  invalid: [
    { filename, code: "test.beforeAll(async ({ request }) => {});", errors: ["beforeAll"] },
    { filename, code: "test.afterAll(() => lead.dispose());", errors: ["afterAll"] },
    { filename, code: 'test.describe.serial("roles", () => {});', errors: ["serial"] },
    { filename, code: 'test.describe.configure({ mode: "serial" });', errors: ['"serial"'] },
  ],
});
