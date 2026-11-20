/**
 * Every text-on-surface pair the interface draws, with its WCAG floor. src/contrast.test.ts
 * checks each pair in both themes, so a token change that breaks one fails the build.
 * Add a pair here when a component puts a token's text on a token's surface for the first time.
 */
export interface Pair {
  text: string;
  on: string;
  /** 4.5 for body text, 3 for large text (24 px, or 18.5 px at 500) and for marks beside a word. */
  min: number;
}

const TEXT = 4.5;
const LARGE = 3;

export const pairs: Pair[] = [
  ...["canvas", "plate", "well", "track"].flatMap((on) => [
    { text: "ink", on, min: TEXT },
    { text: "ink-2", on, min: TEXT },
    { text: "muted", on, min: TEXT },
  ]),
  { text: "on-primary", on: "primary", min: TEXT },
  { text: "on-primary", on: "primary-hover", min: TEXT },
  { text: "tint-ink", on: "tint", min: TEXT },
  { text: "primary", on: "plate", min: TEXT },
  { text: "primary", on: "canvas", min: TEXT },
  { text: "answered-ink", on: "answered", min: TEXT },
  { text: "waiting-ink", on: "waiting", min: TEXT },
  { text: "away-ink", on: "away", min: TEXT },
  { text: "closed-ink", on: "closed", min: TEXT },
  { text: "danger-ink", on: "danger", min: TEXT },
  { text: "danger-ink", on: "plate", min: TEXT },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ text: `avatar-${n}-ink`, on: `avatar-${n}`, min: TEXT })),
  // A status dot sits beside its word, so it needs only to be seen, not read.
  { text: "answered-dot", on: "plate", min: LARGE },
  { text: "waiting-dot", on: "plate", min: 2 },
  { text: "danger-dot", on: "plate", min: LARGE },
  { text: "focus", on: "plate", min: LARGE },
  { text: "focus", on: "canvas", min: LARGE },
];
