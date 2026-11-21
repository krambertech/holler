import { Doc, DoDont, Sub } from "./frame";

const words = [
  ["7 of 12 answered", "7 hollered back"],
  ["Waiting on 5 people", "Radio silence"],
  ["Send reminder", "Holler again"],
  ["New holler", "Create survey"],
  ["Closes Friday at 18:00", "Deadline approaching!"],
  ["We could not send this. Try again.", "Oops! Something went wrong"],
];

export function Voice() {
  return (
    <Doc
      title="Voice and words"
      lede="Plain, warm, brief. Holler talks like a helpful colleague in Slack. The name is the only playful word; everything else says what happens. CONTEXT.md is the authority on which word names what."
    >
      <Sub title="Say this, not that">
        <div className="overflow-hidden rounded-plate bg-plate shadow-[0_0_0_1px_var(--edge)]">
          <div className="grid grid-cols-2 gap-4 px-5 py-2.5 text-muted text-sm">
            <span>Say</span>
            <span>Not</span>
          </div>
          {words.map(([say, not]) => (
            <div key={say} className="grid grid-cols-2 gap-4 border-divider border-t px-5 py-3">
              <span>{say}</span>
              <span className="text-muted line-through decoration-edge-2">{not}</span>
            </div>
          ))}
        </div>
      </Sub>
      <Sub title="Rules">
        <DoDont
          dos={[
            "“Holler” is a noun: a Holler, your hollers. Capital H for the product.",
            "Write both sentences for a count: “1 person still to answer.” and “9 people still to answer.”",
            "Say what failed and what to do next, beside the thing at fault.",
          ]}
          donts={[
            "Use Holler as a verb.",
            "Use exclamation marks or emoji in the product or in Slack.",
            "Build a sentence from fragments or a ternary on === 1.",
          ]}
        />
      </Sub>
    </Doc>
  );
}
