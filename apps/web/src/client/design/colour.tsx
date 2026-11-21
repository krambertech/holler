import { pairs } from "@holler/design";
import { contrast, parse, themes } from "@holler/design/colour";
import tokensCss from "@holler/design/tokens.css?raw";
import { cn } from "@/lib/cn";
import { Doc, DoDont, Sub } from "./frame";

const { light, dark } = themes(tokensCss);

const families: { title: string; note: string; tokens: string[] }[] = [
  {
    title: "Surfaces",
    note: "The warm canvas, white plates on it, and the quiet wells and tracks.",
    tokens: ["canvas", "plate", "well", "track"],
  },
  {
    title: "Text",
    note: "Ink for main text, ink-2 for supporting, muted for secondary. Faint is never text.",
    tokens: ["ink", "ink-2", "muted", "faint"],
  },
  {
    title: "Action",
    note: "Plum by day, soft pink at night. One per screen.",
    tokens: ["primary", "primary-hover", "on-primary", "focus"],
  },
  {
    title: "Highlight and live",
    note: "Tint behind chips and the reminder strip. Pink marks what is live.",
    tokens: ["tint", "tint-ink", "live", "live-ink", "live-dot"],
  },
  {
    title: "Brand",
    note: "The same in both themes. The logo and marks only.",
    tokens: ["plum", "deep-plum", "pink", "soft-pink"],
  },
  {
    title: "Status",
    note: "Each status has a surface, an ink and a dot, and always sits beside its word.",
    tokens: ["answered", "waiting", "away", "closed", "danger"],
  },
  {
    title: "Charts",
    note: "One question's ramp. A single series uses chart-2.",
    tokens: ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"],
  },
];

function Swatch({ token }: { token: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="grid grid-cols-2 overflow-hidden rounded-md shadow-[0_0_0_1px_var(--edge)]">
        <span data-theme="light" className="h-14" style={{ background: `var(--${token})` }} />
        <span data-theme="dark" className="h-14" style={{ background: `var(--${token})` }} />
      </div>
      <span className="font-mono text-xs">{token}</span>
    </div>
  );
}

function ratio(vars: Record<string, string>, text: string, on: string) {
  const t = parse(`var(--${text})`, vars);
  const s = parse(`var(--${on})`, vars);
  return t && s ? contrast(t, s) : 0;
}

export function Colour() {
  return (
    <Doc
      title="Colour"
      lede="Restrained: warm neutrals carry most of every screen, plum covers a tenth or less, pink marks what is live. Every value lives in packages/design/tokens.css; each swatch shows day on the left and night on the right."
    >
      {families.map((family) => (
        <Sub key={family.title} title={family.title} note={family.note}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5">
            {family.tokens.map((token) => (
              <Swatch key={token} token={token} />
            ))}
          </div>
        </Sub>
      ))}
      <Sub
        title="Contrast"
        note="Every text-on-surface pair the interface draws, measured from the tokens in both themes. packages/design/src/contrast.test.ts fails the build when one drops under its floor."
      >
        <div className="overflow-x-auto rounded-plate bg-plate shadow-[0_0_0_1px_var(--edge)]">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-2.5 text-start font-normal">Pair</th>
                <th className="px-4 py-2.5 text-end font-normal">Floor</th>
                <th className="px-4 py-2.5 text-end font-normal">Day</th>
                <th className="px-4 py-2.5 text-end font-normal">Night</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair) => (
                <tr key={`${pair.text}-${pair.on}`} className="border-divider border-t">
                  <td className="px-4 py-2 font-mono">
                    {pair.text} on {pair.on}
                  </td>
                  <td className="px-4 py-2 text-end tabular">{pair.min}</td>
                  {[
                    { theme: "day", vars: light },
                    { theme: "night", vars: dark },
                  ].map(({ theme, vars }) => {
                    const value = ratio(vars, pair.text, pair.on);
                    return (
                      <td
                        key={theme}
                        className={cn(
                          "px-4 py-2 text-end tabular",
                          value < pair.min && "text-danger-ink",
                        )}
                      >
                        {value.toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sub>
      <Sub title="Rules">
        <DoDont
          dos={[
            "Use a token through its Tailwind utility: bg-plate, text-ink-2, bg-tint text-tint-ink.",
            "Put a word beside every status colour.",
            "Add a pair to packages/design/src/pairs.ts the first time a component puts a token's text on a token's surface.",
          ]}
          donts={[
            "Write a raw hex or a stock Tailwind colour in a component. pnpm check:styling fails on it.",
            "Use more than one plum button on a screen.",
            "Set body text in pink.",
          ]}
        />
      </Sub>
    </Doc>
  );
}
