import { testRule } from "../test/run.mjs";

const filename = "list.tsx";

testRule("name-needs-a-role", {
  message:
    "aria-label and aria-labelledby name only an element with a role. A div, a span, a Plate or a Skeleton " +
    "has none, so axe reports aria-prohibited-attr. Give it a role (group, img, status), use an element " +
    "that has one (section, nav, ul), or drop the name.",
  valid: [
    { filename, code: 'const a = <section aria-busy aria-label="Loading your hollers" />;' },
    { filename, code: 'const a = <div role="group" aria-labelledby="title" />;' },
    { filename, code: 'const a = <span role="img" aria-label="Pulse" />;' },
    { filename, code: 'const a = <ul aria-label="People" />;' },
    { filename, code: 'const a = <Plate aria-busy className="p-4" />;' },
    { filename, code: 'const a = <Button aria-label="More" />;' },
  ],
  invalid: [
    {
      filename,
      code: 'const a = <Plate aria-busy aria-label="Loading your hollers" />;',
      errors: ['aria-label="Loading your hollers"'],
    },
    {
      filename,
      code: "const a = <PlateRow aria-labelledby={id} />;",
      errors: ["aria-labelledby={id}"],
    },
    {
      filename,
      code: 'const a = <div aria-label="Loading" />;',
      errors: ['aria-label="Loading"'],
    },
    {
      filename,
      code: 'const a = <span aria-label="3 answered" aria-labelledby="x" />;',
      errors: ['aria-label="3 answered"', 'aria-labelledby="x"'],
    },
  ],
});
