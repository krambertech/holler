import { type IllustrationName, illustrations } from "@holler/design";
import { Illustration } from "@/components/illustration";
import { Doc, DoDont, Sub, Variants } from "./frame";

const names = Object.keys(illustrations) as IllustrationName[];

const layers = [
  { name: "object", what: "A plate, a card, a block. Object colour with a hairline outline." },
  { name: "bar", what: "A line of content or an avatar's place. Filled, never outlined." },
  { name: "ghost", what: "Something that is not there yet. A dashed hairline and no fill." },
  { name: "subject", what: "The one thing the drawing is about, in the tone's surface and ink." },
  { name: "line", what: "A detail in the tone's ink: a tick, a clock's hands, a keyhole." },
  { name: "accent", what: "One solid dot or bar in the tone's strongest colour. At most one." },
];

export function IllustrationPage() {
  return (
    <Doc
      title="Illustration"
      lede="Small drawings for empty and error states. Each one is two or three of Holler's own objects laid out on fading graph paper, with the one that matters picked out. They show what belongs on the screen, never a scene or a character."
    >
      <Sub
        title="The set"
        note="Every drawing, with what it is for. Pick by meaning, not by look: a search that matched nothing is always search, wherever it is."
        source="components/illustration.tsx"
      >
        <Variants
          stack
          items={[
            {
              label: "All drawings",
              render: () => (
                <ul className="grid w-full grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
                  {names.map((name) => (
                    <li
                      key={name}
                      className="flex flex-col items-center gap-3 rounded-md bg-plate px-4 pt-6 pb-4 text-center edge"
                    >
                      <Illustration name={name} size="lg" />
                      <span className="grid gap-1">
                        <code className="font-mono text-ink text-sm">{name}</code>
                        <span className="text-pretty text-muted text-sm">
                          {illustrations[name].use}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ),
            },
          ]}
        />
      </Sub>

      <Sub
        title="Sizes"
        note="Three sizes, matched to the state around them. Outlines stay 1.25 px at every size so they sit with the interface's hairlines; details thicken a little as the drawing grows."
      >
        <Variants
          items={[
            {
              label: "sm, 40 px",
              note: "Inside a small element: a popover, a list cell, a combobox with nothing to offer.",
              render: () => (
                <>
                  <Illustration name="search" size="sm" />
                  <Illustration name="people" size="sm" />
                  <Illustration name="error" size="sm" />
                </>
              ),
            },
            {
              label: "md, 64 px",
              note: "A group inside a screen: no API keys, nothing shared.",
              render: () => (
                <>
                  <Illustration name="search" />
                  <Illustration name="people" />
                  <Illustration name="error" />
                </>
              ),
            },
            {
              label: "lg, 96 px",
              note: "A whole screen on first use, or a page that failed.",
              render: () => (
                <>
                  <Illustration name="search" size="lg" />
                  <Illustration name="people" size="lg" />
                  <Illustration name="error" size="lg" />
                </>
              ),
            },
          ]}
        />
      </Sub>

      <Sub
        title="Tones"
        note="A tone is what the drawing means, the same words as everywhere else. Neutral uses Holler's tint and plum; warning and danger use their status colours. Errors start in danger and a locked page in warning, so most callers never set one."
      >
        <Variants
          items={[
            {
              label: "neutral",
              note: "Empty, first use, all done.",
              render: () => (
                <>
                  <Illustration name="done" tone="neutral" />
                  <Illustration name="locked" tone="neutral" />
                </>
              ),
            },
            {
              label: "warning",
              note: "Blocked but not broken: no access, a limit reached.",
              render: () => (
                <>
                  <Illustration name="done" tone="warning" />
                  <Illustration name="locked" tone="warning" />
                </>
              ),
            },
            {
              label: "danger",
              note: "Something failed and needs a try again.",
              render: () => (
                <>
                  <Illustration name="done" tone="danger" />
                  <Illustration name="locked" tone="danger" />
                </>
              ),
            },
          ]}
        />
      </Sub>

      <Sub
        title="How a drawing is built"
        note="Shapes name a layer, never a colour, so one drawing works in day, night and every tone. The geometry lives in packages/design/src/illustrations.ts beside the logo's; a test holds every drawing to the rules below."
      >
        <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          <div className="grid place-items-center rounded-plate bg-plate p-6 edge">
            <Illustration name="keys" size="lg" className="size-40" />
          </div>
          <dl className="grid gap-3">
            {layers.map((layer) => (
              <div key={layer.name} className="grid gap-0.5">
                <dt className="font-mono text-ink text-sm">{layer.name}</dt>
                <dd className="text-ink-2">{layer.what}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Sub>

      <Sub title="Rules">
        <DoDont
          dos={[
            "Draw on the 64 grid and fill it: the longest side spans at least 48 units, so drawings sit together at the same size.",
            "Use two or three objects that appear in Holler: plates, rows, avatars, chips, a key, a clock.",
            "Pick out one subject. Give it at most one accent.",
            "Tilt an object by 12 degrees at most, so the drawing looks set down rather than thrown.",
            "Check it at 40 px. If it does not read there, take a shape out.",
          ]}
          donts={[
            "Draw people, faces, hands or mascots. Holler's only character is the calling h.",
            "Use speech bubbles, megaphones or sound waves. The theme lives in the logo.",
            "Put words, numbers or a question mark inside a drawing. The title beside it says it.",
            "Animate a drawing on load. A state appears; it does not perform.",
            "Put a circle, tile or shadow behind a drawing. The fading grid is its only backdrop.",
            "Use a drawing as decoration on a screen that has content.",
          ]}
        />
      </Sub>
    </Doc>
  );
}
