import { testRule } from "../test/run.mjs";

const filename = "page.tsx";

testRule("label-needs-role", {
  message:
    "A div, span or Plate has no role, so an aria-label on it names nothing: screen readers skip it " +
    "and axe refuses it as aria-prohibited-attr. Give it a role that takes a name, such as " +
    'role="status" for a loading state or role="group", or use an element that has one, such as a section.',
  valid: [
    {
      filename,
      code: 'const a = <Plate role="status" aria-busy aria-label="Loading your hollers" />;',
    },
    { filename, code: 'const a = <section aria-busy aria-label="Loading this Holler" />;' },
    { filename, code: 'const a = <div role="group" aria-labelledby="title" />;' },
    { filename, code: 'const a = <button aria-label="Close" />;' },
    { filename, code: 'const a = <div {...props} aria-label="Answers" />;' },
    { filename, code: "const a = <Plate aria-busy />;" },
  ],
  invalid: [
    {
      filename,
      code: 'const a = <Plate aria-busy aria-label="Loading your hollers" />;',
      errors: ['aria-label="Loading your hollers"'],
    },
    {
      filename,
      code: 'const a = <div aria-labelledby="title" />;',
      errors: ['aria-labelledby="title"'],
    },
    {
      filename,
      code: 'const a = <span aria-label="3 answered">3</span>;',
      errors: ['aria-label="3 answered"'],
    },
  ],
});
