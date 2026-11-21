import { Canvas, Doc, DoDont, Sub } from "./frame";

const steps = [
  {
    name: "text-8xl",
    size: "80",
    use: "Marketing hero only",
    sample: "Ask your team.",
    className: "text-8xl tracking-display",
  },
  {
    name: "text-6xl",
    size: "44",
    use: "Marketing headings",
    sample: "Stop chasing them",
    className: "text-6xl tracking-display",
  },
  {
    name: "text-5xl",
    size: "30",
    use: "Site section headings",
    sample: "How it works",
    className: "text-5xl tracking-title",
  },
  {
    name: "text-4xl",
    size: "27",
    use: "A screen's title",
    sample: "Your hollers",
    className: "text-4xl tracking-title",
  },
  {
    name: "text-3xl",
    size: "24",
    use: "Numbers on Home, a dialog's title",
    sample: "13",
    className: "text-3xl tabular",
  },
  { name: "text-2xl", size: "21", use: "Large headings", sample: "Results", className: "text-2xl" },
  {
    name: "text-xl",
    size: "19",
    use: "The wordmark, lead text",
    sample: "holler",
    className: "text-xl font-semibold tracking-[-0.02em]",
  },
  {
    name: "text-lg",
    size: "17",
    use: "Group and question headings",
    sample: "Anything in your way?",
    className: "text-lg",
  },
  {
    name: "text-base",
    size: "15",
    use: "Names at 400, body at 300",
    sample: "Waiting on the pricing copy before I can ship the page.",
    className: "text-base",
  },
  {
    name: "text-sm",
    size: "13.5",
    use: "Captions",
    sample: "Pulse · closes Fri 18:00",
    className: "text-sm text-muted",
  },
  {
    name: "text-xs",
    size: "12",
    use: "Column labels, notes",
    sample: "Answered",
    className: "text-xs text-muted",
  },
];

const weights = [
  { weight: 300, use: "Body and captions; 330 at night" },
  { weight: 400, use: "Titles, names, numbers" },
  { weight: 500, use: "Buttons only" },
  { weight: 600, use: "The wordmark only" },
];

export function Typography() {
  return (
    <Doc
      title="Typography"
      lede="One family, Geologica, self-hosted. A 1.125 scale from 15 px. Size makes the hierarchy; weight only separates a name from the text around it."
    >
      <Sub
        title="Scale"
        note="Every step is a Tailwind utility over the tokens. Sizes are rem, so a reader's browser setting scales them."
      >
        <div className="overflow-hidden rounded-plate bg-plate shadow-[0_0_0_1px_var(--edge)]">
          {steps.map((step) => (
            <div
              key={step.name}
              className="grid gap-2 border-divider border-t px-5 py-4 first:border-t-0 md:grid-cols-[11rem_minmax(0,1fr)] md:items-baseline"
            >
              <div className="grid font-mono text-muted text-xs">
                <span className="text-ink">{step.name}</span>
                <span>
                  {step.size} px · {step.use}
                </span>
              </div>
              <span className={`min-w-0 truncate ${step.className}`}>{step.sample}</span>
            </div>
          ))}
        </div>
      </Sub>
      <Sub title="Weights" note="Nothing is ever 700. Never two heavy things side by side.">
        <Canvas className="grid gap-4 sm:grid-cols-4">
          {weights.map((w) => (
            <div key={w.weight} className="grid gap-1">
              <span className="text-5xl" style={{ fontWeight: w.weight }}>
                Aa
              </span>
              <span className="font-mono text-muted text-xs">
                {w.weight} · {w.use}
              </span>
            </div>
          ))}
        </Canvas>
      </Sub>
      <Sub title="Rules">
        <DoDont
          dos={[
            "Tighten titles to -0.025em (tracking-title) and display type to -0.035em.",
            "Use sentence case everywhere.",
            "Set counts and tables with tabular figures.",
          ]}
          donts={[
            "Use all caps or tracked-out labels.",
            "Use 700, or weight to make a hierarchy that size should make.",
            "Set prose wider than 70 characters: max-w-[68ch].",
          ]}
        />
      </Sub>
    </Doc>
  );
}
