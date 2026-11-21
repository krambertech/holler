import { Logo, Mark } from "@/components/logo";
import { Canvas, Doc, DoDont, Sub } from "./frame";

export function Brand() {
  return (
    <Doc
      title="Brand"
      lede="The calling h: a lowercase h with two sound lines, in a plum square. The theme of Holler lives in this mark and nowhere else in the interface."
    >
      <Sub
        title="The mark"
        note="One shape is the app icon, the favicon and the Slack bot avatar. Below 24 px the strokes thicken so it still reads."
        source="components/logo.tsx"
      >
        <Canvas className="flex flex-wrap items-end gap-6">
          <Mark size={96} />
          <Mark size={64} />
          <Mark size={36} />
          <Mark size={24} />
          <Mark size={16} />
        </Canvas>
      </Sub>
      <Sub
        title="The wordmark"
        note="Always lowercase “holler” in Geologica 600, the only place 600 appears. Capital H for the product in prose and in Slack."
      >
        <Canvas className="flex flex-wrap items-center gap-10">
          <Logo />
          <Logo size={44} />
        </Canvas>
      </Sub>
      <Sub
        title="On colour"
        note="On plum the mark turns white with pink lines. At night it keeps its plum square."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div
            data-theme="light"
            className="flex items-center gap-3 rounded-plate bg-canvas p-5 text-ink shadow-[0_0_0_1px_var(--edge)]"
          >
            <Logo />
          </div>
          <div
            data-theme="dark"
            className="flex items-center gap-3 rounded-plate bg-canvas p-5 text-ink"
          >
            <Logo />
          </div>
          <div className="flex items-center gap-3 rounded-plate bg-plum p-5 text-white">
            <span className="font-semibold text-xl tracking-[-0.02em]">holler</span>
          </div>
        </div>
      </Sub>
      <Sub title="Rules">
        <DoDont
          dos={[
            "Give the mark clear space of half its width.",
            "Use it at 16 px or larger.",
            "Keep the sound lines soft pink.",
          ]}
          donts={[
            "Put speech bubbles, megaphones or sound waves into the interface. The first design round did, and it read as cartoonish.",
            "Recolour the sound lines or the square.",
            "Use the word Holler as a verb anywhere.",
          ]}
        />
      </Sub>
    </Doc>
  );
}
