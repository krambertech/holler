/**
 * The calling h: a lowercase h with two sound lines at its top right, drawn on a 48 × 48 grid.
 * It sits in a rounded square (28% radius) so the same shape is the app icon and the Slack avatar.
 * The stem and shoulder are white on plum; the sound lines are soft pink. Never recolour them.
 */
export const mark = {
  viewBox: "0 0 48 48",
  letter: "M13 9v30M13 28c0-5.5 4-9 9-9s9 3.5 9 9v11",
  sound: "M33 12a8 8 0 0 1 6 6M36 5a15 15 0 0 1 9 9",
  /** Stroke widths at 20 px and above. Below 20 px the strokes thicken so the mark still reads. */
  letterStroke: 6.5,
  soundStroke: 3.6,
  smallLetterStroke: 7.5,
  smallSoundStroke: 4.6,
  /** The square's corner radius as a share of its side. */
  cornerRadius: 0.28,
} as const;

/** The wordmark is always lowercase, in Geologica 600, tracked in. */
export const wordmark = { text: "holler", weight: 600, tracking: "-0.035em" } as const;

/** Every status the interface shows. Each has a surface, an ink and a dot token of the same name. */
export type Status = "answered" | "waiting" | "away" | "closed" | "danger";

export * from "./motion";
export { type Pair, pairs } from "./pairs";
