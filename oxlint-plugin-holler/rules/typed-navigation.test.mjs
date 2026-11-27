import { testRule } from "../test/run.mjs";

const filename = "holler.tsx";

testRule("typed-navigation", {
  message:
    "Navigate with `to`, `params` and `search`, so TanStack Router's types refuse a route that does not " +
    "exist. An `href` typechecks for any path and lands on the not-found page when the route is missing.",
  valid: [
    { filename, code: 'navigate({ to: "/hollers/$id", params: { id } });' },
    { filename, code: 'router.navigate({ to: "/", replace: true });' },
    { filename, code: 'throw redirect({ to: "/sign-in" });' },
    { filename, code: 'const link = { href: "/new" };' },
  ],
  invalid: [
    {
      filename,
      code: "navigate({ href: `/new?draft=${id}` });",
      errors: ["href: `/new?draft=${id}`"],
    },
    {
      filename,
      code: 'router.navigate({ href: "/settings", replace: true });',
      errors: ['href: "/settings"'],
    },
    { filename, code: 'throw redirect({ href: "/sign-in" });', errors: ['href: "/sign-in"'] },
  ],
});
