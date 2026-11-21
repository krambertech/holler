// Motion presets in Motion's shape. The primitives use them, so every choice moves the same way.
// The design site's Motion page shows each one.

export type Curve = readonly [number, number, number, number];

export interface Timed {
  duration: number;
  ease: Curve | "linear";
  delay?: number;
}

/** `--ease-out`: anything that enters or answers an input. */
export const EASE_OUT: Curve = [0.22, 1, 0.36, 1];

/** A choice mark appearing: a tick, a radio dot. A small spring, so it lands rather than fades. */
export const CHOICE_POP = { type: "spring", duration: 0.32, bounce: 0.3 } as const;
/** A chosen highlight moving to another option. */
export const CHOICE_SLIDE = { type: "spring", duration: 0.34, bounce: 0.16 } as const;
/** A tick drawing its stroke after the box fills. */
export const CHOICE_DRAW = { duration: 0.22, ease: EASE_OUT, delay: 0.05 } as const satisfies Timed;
/** A choice mark leaving. Faster than it came. */
export const CHOICE_LEAVE = { duration: 0.1, ease: EASE_OUT } as const satisfies Timed;
/** A colour or opacity change on a choice. */
export const CHOICE_FADE = { duration: 0.15, ease: "linear" } as const satisfies Timed;
/** Reduced motion for anything that moves; a choice mark falls back to CHOICE_FADE instead, so it still shows a change. */
export const INSTANT = { duration: 0 } as const;
