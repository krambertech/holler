/**
 * The faces: small rounded squares, the logo's own shape, with two eyes. They are the site's one
 * illustration. A face is shut-eyed while it waits, opens its eyes when a call reaches it, and
 * turns plum once it has answered. Canvas helpers shared by the hero and the closing section.
 */
import { mark } from "@holler/design";

export type FaceState = "waiting" | "awake" | "answered";

export interface FaceColours {
  answered: string;
  plate: string;
  edge: string;
  eyeOn: string;
  eyeOff: string;
}

export interface FaceDraw {
  x: number;
  y: number;
  size: number;
  state: FaceState;
  /** Where the eyes look, as a vector of length 0 to 1. */
  look: [number, number];
  blink?: boolean | undefined;
  rotate?: number | undefined;
  scale?: number | undefined;
  fill?: string | undefined;
  alpha?: number | undefined;
}

const LETTER = new Path2D(mark.letter);
const SOUND = new Path2D(mark.sound);

/** Where the logo's sound lines are centred on its 48-unit grid, and their radii. */
export const SOUND_CENTRE = { x: 31, y: 19, inner: 8, outer: 15 } as const;
/** The sound lines' angles around that centre, in radians. */
export const SOUND_ARC = { start: -1.29, end: -0.12 } as const;

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Reads a token from the page, so canvas drawings follow day and night. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function faceColours(): FaceColours {
  return {
    answered: token("--primary"),
    plate: token("--plate"),
    edge: token("--edge-2"),
    eyeOn: token("--on-primary"),
    eyeOff: token("--faint"),
  };
}

export function drawFace(ctx: CanvasRenderingContext2D, face: FaceDraw, colours: FaceColours) {
  const { x, y, size: s, state } = face;
  ctx.save();
  ctx.globalAlpha = face.alpha ?? 1;
  ctx.translate(x, y);
  ctx.rotate(face.rotate ?? 0);
  const k = face.scale ?? 1;
  ctx.scale(k, k);
  roundRect(ctx, -s / 2, -s / 2, s, s, s * mark.cornerRadius);
  if (state === "answered") {
    ctx.fillStyle = face.fill ?? colours.answered;
    ctx.fill();
  } else {
    ctx.fillStyle = colours.plate;
    ctx.fill();
    ctx.strokeStyle = colours.edge;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  const ex = s * 0.17;
  const ey = -s * 0.06;
  const er = s * 0.075;
  const lx = face.look[0] * s * 0.06;
  const ly = face.look[1] * s * 0.06;
  ctx.fillStyle = state === "answered" ? colours.eyeOn : colours.eyeOff;
  for (const side of [-1, 1]) {
    const cx = side * ex + lx;
    const cy = ey + ly;
    if (state === "waiting" || face.blink) {
      roundRect(ctx, cx - er * 1.1, cy + er * 0.12, er * 2.2, er * 0.56, er * 0.28);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, er, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** The calling h, drawn with its sound lines at the given strength (0 hides them). */
export function drawMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  sound: number,
) {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 48, size / 48);
  ctx.fillStyle = token("--plum");
  roundRect(ctx, 0, 0, 48, 48, 48 * mark.cornerRadius);
  ctx.fill();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "white";
  ctx.lineWidth = mark.letterStroke;
  ctx.stroke(LETTER);
  ctx.strokeStyle = token("--soft-pink");
  ctx.lineWidth = mark.soundStroke;
  ctx.globalAlpha = Math.max(0, Math.min(1, sound));
  ctx.stroke(SOUND);
  ctx.restore();
}

/** Unit vector from (x, y) towards (tx, ty), shortened when the target is close. */
export function lookAt(x: number, y: number, tx: number, ty: number, reach = 60): [number, number] {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, d / reach);
  return [(dx / d) * k, (dy / d) * k];
}

export const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A canvas that fills its parent at the device's pixel ratio, draws only while on screen, and
 * draws one still frame when motion is reduced.
 */
export function canvasScene(
  canvas: HTMLCanvasElement,
  hooks: {
    setup: (w: number, h: number) => void;
    draw: (ctx: CanvasRenderingContext2D, t: number) => void;
  },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { restart() {} };
  const reduce = prefersReducedMotion();
  let width = 0;
  let height = 0;
  let start = performance.now();
  let visible = false;
  const frame = (t: number) => {
    ctx.clearRect(0, 0, width, height);
    hooks.draw(ctx, t);
  };
  const size = () => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    hooks.setup(width, height);
    if (reduce) frame(Number.POSITIVE_INFINITY);
  };
  const loop = (now: number) => {
    if (visible && width && !reduce) frame(now - start);
    requestAnimationFrame(loop);
  };
  new ResizeObserver(size).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
  }).observe(canvas);
  requestAnimationFrame(loop);
  return {
    restart() {
      start = performance.now();
      hooks.setup(width, height);
      if (reduce) frame(Number.POSITIVE_INFINITY);
    },
  };
}
