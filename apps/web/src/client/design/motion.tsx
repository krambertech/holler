import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { Canvas, Doc, DoDont, Sub } from "./frame";

export function Motion() {
  const [value, setValue] = useState(0.35);
  return (
    <Doc
      title="Motion"
      lede="Motion shows a change of state and nothing else: 150 to 250 ms on one ease-out curve. Menus open in 140 ms and close in 100, and a choice mark lands with one small spring. Nothing plays on page load, and reduced motion turns every animation into an instant change."
    >
      <Sub
        title="Timing"
        note="--default-transition-duration is 180 ms and --ease-out is cubic-bezier(0.22, 1, 0.36, 1). Buttons press down 2%; nothing lifts on hover."
      >
        <Canvas className="flex flex-wrap items-center gap-6">
          <Button variant="primary">Press me</Button>
          <div className="grid w-64 gap-2">
            <ProgressBar value={value} />
            <Button size="sm" onClick={() => setValue(value > 0.9 ? 0.2 : value + 0.2)}>
              Fill the bar
            </Button>
          </div>
        </Canvas>
      </Sub>
      <Sub
        title="Reduced motion"
        note="styles.css cuts every animation and transition to 1 ms under prefers-reduced-motion. Components that animate with motion/react ask useReduceMotion(), which Oxlint enforces."
      />
      <Sub title="Rules">
        <DoDont
          dos={[
            "Animate transform and opacity.",
            "Let a bar fill or a row appear when its data changes.",
            "Keep transitions under 250 ms.",
          ]}
          donts={[
            "Fade sections in on scroll or on page load.",
            "Bounce, overshoot or spring.",
            "Animate width, height or layout without a reason.",
          ]}
        />
      </Sub>
    </Doc>
  );
}
