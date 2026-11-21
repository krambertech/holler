import { Doc, Sub } from "./frame";

const rules = [
  [
    "Contrast",
    "Every text pair meets WCAG AA in day and night.",
    "packages/design/src/contrast.test.ts",
  ],
  [
    "Colour is never alone",
    "Every status shows its word beside its colour.",
    "StatusChip requires its word as children",
  ],
  [
    "Keyboard",
    "Everything works from the keyboard, with a 2 px focus ring in plum or soft pink.",
    "styles.css :focus-visible",
  ],
  ["Pages", "Every page a browser journey visits passes axe at WCAG 2.2 AA.", "e2e/a11y.ts"],
  [
    "Motion",
    "prefers-reduced-motion turns animation into an instant change.",
    "styles.css, useReduceMotion()",
  ],
  [
    "Direction",
    "Logical properties only, so a right-to-left layout needs no rework.",
    "pnpm check:styling",
  ],
  [
    "Slack",
    "Message text is the question, so notifications and screen readers read it first.",
    "docs/slack.md",
  ],
];

export function Accessibility() {
  return (
    <Doc
      title="Accessibility"
      lede="WCAG 2.2 AA. Each rule below names what holds it in place, so a break shows up before review."
    >
      <Sub>
        <div className="overflow-hidden rounded-plate bg-plate shadow-[0_0_0_1px_var(--edge)]">
          {rules.map(([title, rule, check]) => (
            <div
              key={title}
              className="grid gap-1 border-divider border-t px-5 py-4 first:border-t-0 md:grid-cols-[10rem_minmax(0,1fr)_17rem] md:gap-4"
            >
              <span className="font-normal">{title}</span>
              <span className="text-ink-2">{rule}</span>
              <span className="font-mono text-muted text-xs [overflow-wrap:anywhere]">{check}</span>
            </div>
          ))}
        </div>
      </Sub>
    </Doc>
  );
}
