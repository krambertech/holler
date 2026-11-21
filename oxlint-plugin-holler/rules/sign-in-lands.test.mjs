import { testRule } from "../test/run.mjs";

const filename = "settings.spec.ts";

testRule("sign-in-lands", {
  message:
    "Sign in with signInAs(page, persona, to) from e2e/a11y.ts. It lands on `to` and waits for it, so " +
    "the sign-in redirect never races the test's next navigation, which WebKit reports as an interrupted goto.",
  valid: [
    { filename, code: 'async function t(page) { await signInAs(page, "lead", "/settings"); }' },
    {
      filename,
      code: 'async function t(page) { await signInAs(page, "lead"); await page.getByRole("link").click(); await page.goto("/install"); }',
    },
    { filename, code: 'async function t(page) { await page.goto("/install"); }' },
  ],
  invalid: [
    {
      filename,
      code: 'async function t(page) { await signInAs(page, "lead"); await page.goto("/settings"); }',
      errors: ['page.goto("/settings")'],
    },
    {
      filename,
      code: 'async function t(page) { await page.goto("/api/dev/sign-in?as=lead&to=/settings"); }',
      errors: ['"/api/dev/sign-in?as=lead&to=/settings"'],
    },
    {
      filename,
      code: "async function t(page, to) { await page.goto(`/api/dev/sign-in?as=lead&to=${to}`); }",
      errors: ["`/api/dev/sign-in?as=lead&to=${to}`"],
    },
  ],
});
