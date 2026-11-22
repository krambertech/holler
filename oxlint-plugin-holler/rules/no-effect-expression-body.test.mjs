import { testRule } from "../test/run.mjs";

const filename = "page.tsx";

testRule("no-effect-expression-body", {
  message:
    "An effect written as () => expression returns that expression, and React calls whatever " +
    "comes back as its cleanup, so the page crashes when it is not a function. Write the body in " +
    "braces, () => { ... }, and return the cleanup there when there is one.",
  valid: [
    { filename, code: "useEffect(() => { window.scrollTo({ top: 0 }); }, []);" },
    { filename, code: "useEffect(() => () => stop(), []);" },
    { filename, code: "useEffect(() => function cleanup() { stop(); }, []);" },
    { filename, code: "useEffect(start, []);" },
    { filename, code: "useLayoutEffect(() => { return claim(id); }, [id]);" },
    { filename, code: "useMemo(() => compute(), []);" },
  ],
  invalid: [
    {
      filename,
      code: "useEffect(() => window.scrollTo({ top: 0 }), []);",
      errors: ["() => window.scrollTo({ top: 0 })"],
    },
    {
      filename,
      code: "React.useLayoutEffect(() => ref.current?.focus(), [open]);",
      errors: ["() => ref.current?.focus()"],
    },
    {
      filename,
      code: "useEffect(async () => load(), []);",
      errors: ["async () => load()"],
    },
  ],
});
