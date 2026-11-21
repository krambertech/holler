import { Button } from "@/components/ui/button";
import { Plate, PlateRow } from "@/components/ui/plate";
import { Canvas, Doc, DoDont, Sub } from "./frame";

const spacing = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16];
const radii = [
  { token: "rounded-plate", px: 16, use: "Plates and row groups" },
  { token: "rounded-md", px: 12, use: "Menus, small plates, the tab track" },
  { token: "rounded-control", px: 10, use: "Buttons, inputs, selects" },
  { token: "rounded-glyph", px: 9, use: "Mode glyphs" },
  { token: "rounded-sm", px: 7, use: "Small buttons, menu items" },
  { token: "rounded-xs", px: 4, use: "The smallest switches and tags" },
  { token: "rounded-full", px: 999, use: "Chips, avatars, dots" },
];
const layers = ["sticky", "dropdown", "dialog", "toast", "tooltip"]; // tokens.css --z-*

export function Space() {
  return (
    <Doc
      title="Space, shape and depth"
      lede="A 4 px grid, a small set of radii that nest, and depth from one hairline. Only what floats over the page gets a shadow."
    >
      <Sub
        title="Spacing"
        note="Tailwind's spacing scale is the 4 px grid: p-4 is 16 px. Rows inside a plate use 20 px sides and 13 px vertical padding; compact tables use 12 and 8."
      >
        <Canvas className="grid gap-2">
          {spacing.map((step) => (
            <div key={step} className="flex items-center gap-4">
              <span className="w-24 font-mono text-muted text-xs">
                {step} · {step * 4} px
              </span>
              <span className="h-3 rounded-full bg-tint" style={{ width: step * 4 }} />
            </div>
          ))}
        </Canvas>
      </Sub>
      <Sub
        title="Radii"
        note="Plates are 16 px and controls 10 px, so a control inset 6 px inside a plate nests concentrically."
      >
        <Canvas className="grid gap-4 sm:grid-cols-3">
          {radii.map((r) => (
            <div key={r.token} className="flex items-center gap-3">
              <span
                className={`size-14 shrink-0 bg-plate shadow-[0_0_0_1px_var(--edge-2)] ${r.token}`}
              />
              <span className="grid font-mono text-xs">
                <span>{r.token}</span>
                <span className="text-muted">
                  {r.px === 999 ? "pill" : `${r.px} px`} · {r.use}
                </span>
              </span>
            </div>
          ))}
        </Canvas>
      </Sub>
      <Sub
        title="Depth"
        note="A plate's depth is its hairline edge. Menus, popovers, dialogs and toasts float over the page and add one soft shadow: shadow-float."
      >
        <Canvas className="relative grid gap-4 sm:grid-cols-2">
          <Plate>
            <PlateRow className="px-5 py-3">A plate: hairline only</PlateRow>
            <PlateRow className="px-5 py-3 text-muted">Rows share it with a divider</PlateRow>
          </Plate>
          <div className="grid w-56 gap-0.5 rounded-md bg-plate p-1.5 shadow-float">
            <span className="rounded-sm bg-well px-2.5 py-1.5">Send reminder</span>
            <span className="rounded-sm px-2.5 py-1.5">Export CSV</span>
            <span className="rounded-sm px-2.5 py-1.5">Close now</span>
          </div>
        </Canvas>
      </Sub>
      <Sub
        title="Stacking"
        note="Every layer takes its z-index from this scale, lowest first. Never an arbitrary number."
      >
        <Canvas className="flex flex-wrap gap-2">
          {layers.map((layer, i) => (
            <span key={layer} className="rounded-full bg-well px-3 py-1 font-mono text-xs">
              {i + 1}. z-(--z-{layer})
            </span>
          ))}
        </Canvas>
      </Sub>
      <Sub title="Rules">
        <DoDont
          dos={[
            "Group related rows on one plate.",
            "Use shadow-float for anything that floats.",
            <span key="b">
              Pair a plate's buttons at the control radius: <Button size="sm">Like this</Button>
            </span>,
          ]}
          donts={[
            "Nest a plate inside a plate.",
            "Give a plate a drop shadow or a gradient.",
            "Write a z-index number by hand.",
          ]}
        />
      </Sub>
    </Doc>
  );
}
