export type Layer = "object" | "bar" | "ghost" | "subject" | "line" | "accent";

export type Shape =
  | { kind: "rect"; layer: Layer; x: number; y: number; w: number; h: number; r?: number }
  | { kind: "circle"; layer: Layer; cx: number; cy: number; r: number }
  | { kind: "path"; layer: Layer; d: string }
  | {
      kind: "group";
      rotate?: number;
      origin?: readonly [number, number];
      move?: readonly [number, number];
      shapes: readonly Shape[];
    };

export interface Illustration {
  use: string;
  tone?: "neutral" | "warning" | "danger";
  shapes: readonly Shape[];
}

export const illustrationGrid = {
  viewBox: "0 0 64 64",
  size: 64,
  backdrop: { step: 8, fade: 0.35 },
  sizes: { sm: 40, md: 64, lg: 96 },
} as const;

const rect = (layer: Layer, x: number, y: number, w: number, h: number, r = 0): Shape => ({
  kind: "rect",
  layer,
  x,
  y,
  w,
  h,
  r,
});
const circle = (layer: Layer, cx: number, cy: number, r: number): Shape => ({
  kind: "circle",
  layer,
  cx,
  cy,
  r,
});
const path = (layer: Layer, d: string): Shape => ({ kind: "path", layer, d });
const group = (
  shapes: Shape[],
  rotate = 0,
  origin: readonly [number, number] = [32, 32],
  move: readonly [number, number] = [0, 0],
): Shape => ({ kind: "group", rotate, origin, move, shapes });

export const illustrations = {
  hollers: {
    use: "No hollers yet. Shows the row that will appear: the mode, the title and the answered bar.",
    shapes: [
      group([rect("object", 14, 11, 36, 16, 5), rect("bar", 19, 16, 14, 3, 1.5)], 4, [32, 19]),
      group(
        [
          rect("object", 2, 29, 58, 25, 6),
          rect("subject", 7.5, 35, 13, 13, 3.5),
          path("line", "M10 41.5h2.25l1.75-3.25 2.25 6.5 1.75-3.25h1.75"),
          rect("bar", 26, 36, 22, 3.25, 1.6),
          rect("bar", 26, 42, 13, 2.6, 1.3),
          rect("bar", 26, 47.5, 28, 2.2, 1.1),
          rect("accent", 26, 47.5, 16, 2.2, 1.1),
        ],
        -5,
        [31, 41.5],
      ),
    ],
  },
  shared: {
    use: "Nothing shared with you yet. Two plates passed across, one with its sender.",
    shapes: [
      group(
        [
          rect("object", 4, 12, 30, 38, 6),
          rect("bar", 9, 18, 15, 3, 1.5),
          rect("bar", 9, 24, 20, 2.5, 1.25),
        ],
        -12,
        [19, 31],
      ),
      group(
        [
          rect("object", 28, 15, 32, 40, 6),
          rect("subject", 33, 20, 9, 9, 4.5),
          rect("bar", 45, 23, 10, 3, 1.5),
          rect("bar", 33, 34, 22, 2.6, 1.3),
          rect("bar", 33, 40, 15, 2.6, 1.3),
          rect("bar", 33, 46, 19, 2.6, 1.3),
        ],
        8,
        [44, 35],
      ),
    ],
  },
  keys: {
    use: "No API keys yet. A key above the row it will become.",
    shapes: [
      rect("object", 12, 37, 50, 17, 5),
      circle("bar", 19.5, 45.5, 3),
      rect("bar", 26, 42.5, 18, 3, 1.5),
      rect("bar", 26, 47.5, 11, 2.2, 1.1),
      group(
        [
          circle("subject", 16, 23, 9.5),
          rect("subject", 23, 20.75, 31, 5, 2.5),
          rect("subject", 44, 23, 4, 7, 1.25),
          rect("subject", 49.5, 23, 4, 9.5, 1.25),
          circle("object", 13, 23, 3),
        ],
        -12,
        [32, 24],
      ),
    ],
  },
  search: {
    use: "A search or filter matched nothing. The rows are dashed because they are not there.",
    shapes: [
      rect("object", 5, 9, 40, 42, 6),
      rect("ghost", 10.5, 15, 29, 7, 3.5),
      rect("ghost", 10.5, 25.5, 29, 7, 3.5),
      rect("ghost", 10.5, 36, 18, 5, 2.5),
      group([rect("subject", 53.5, 37.25, 10, 5.5, 2.75)], 45, [43, 40]),
      circle("subject", 43, 40, 12),
      path("line", "M36 37a8 8 0 0 1 5-5"),
    ],
  },
  results: {
    use: "No answers yet. The bars are waiting, and the clock says Holler is still asking.",
    shapes: [
      rect("object", 4, 17, 46, 37, 6),
      rect("ghost", 11, 30, 7, 18, 2.75),
      rect("ghost", 21.5, 35, 7, 13, 2.75),
      rect("ghost", 32, 25, 7, 23, 2.75),
      rect("bar", 9, 49.5, 34, 1.5, 0.75),
      circle("subject", 48, 17, 11),
      path("line", "M48 11v6l4 2.75"),
    ],
  },
  scheduled: {
    use: "Nothing scheduled. A month with one day picked out.",
    shapes: [
      group(
        [
          rect("object", 13, 17, 46, 40, 6),
          path("subject", "M13 23a6 6 0 0 1 6-6h34a6 6 0 0 1 6 6v6H13z"),
          path("line", "M25 12.5v8M47 12.5v8"),
          ...[36, 43.5, 51].flatMap((y) =>
            [20, 28.5, 37, 45.5, 54].map((x) =>
              x === 45.5 && y === 43.5 ? circle("accent", x, y, 3.25) : circle("bar", x, y, 1.9),
            ),
          ),
        ],
        6,
        [36, 37],
        [-3, -3],
      ),
    ],
  },
  done: {
    use: "Everyone answered, or nothing is left to do. Rows checked off, with a tick.",
    shapes: [
      rect("object", 3, 9, 45, 41, 6),
      ...[19.5, 29.5, 39.5].flatMap((y, i) => [
        circle("bar", 11, y, 3.25),
        rect("bar", 18, y - 1.6, [20, 14, 17][i] ?? 17, 3.2, 1.6),
      ]),
      circle("subject", 48, 47, 11),
      path("line", "M43 47.25l3.5 3.5 6.25-6.5"),
    ],
  },
  people: {
    use: "No one picked yet. Two empty places and the first person to add.",
    shapes: [
      circle("ghost", 11, 29, 9),
      circle("ghost", 53, 29, 9),
      circle("subject", 32, 29, 12),
      path("line", "M32 23.5v11M26.5 29h11"),
      rect("bar", 18, 47, 28, 3.2, 1.6),
      rect("bar", 24, 53.5, 16, 2.6, 1.3),
    ],
  },
  error: {
    use: "Something failed to load. The plate came apart; the rest of the page still works.",
    tone: "danger",
    shapes: [
      group(
        [
          path("object", "M8 16h23l-3 7 4 6-4 6 4 6-3 7H8a6 6 0 0 1-6-6V22a6 6 0 0 1 6-6z"),
          rect("subject", 7, 22, 13, 13, 3.5),
          path("line", "M13.5 25.5v4M13.5 32.25v.01"),
          rect("bar", 7, 40, 14, 2.6, 1.3),
        ],
        -8,
        [17, 32],
        [-1, 1],
      ),
      group(
        [
          path("object", "M31 16h23a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H29l3-7-4-6 4-6-4-6z"),
          rect("bar", 36, 23, 17, 3.2, 1.6),
          rect("bar", 37, 30, 11, 2.6, 1.3),
          rect("bar", 36, 37, 15, 2.6, 1.3),
        ],
        9,
        [46, 32],
        [2, 3],
      ),
    ],
  },
  offline: {
    use: "Holler could not be reached. Two ends that should meet, pulled apart.",
    tone: "danger",
    shapes: [
      group(
        [
          path("line", "M25 33h7M25 41h7"),
          rect("object", 1, 28, 25, 18, 5),
          rect("bar", 7, 35.5, 11, 3, 1.5),
        ],
        -10,
        [14, 37],
      ),
      group(
        [
          rect("subject", 38, 16, 25, 18, 5),
          rect("object", 41.5, 20.5, 5.5, 2.4, 1.2),
          rect("object", 41.5, 27, 5.5, 2.4, 1.2),
        ],
        -10,
        [50, 25],
      ),
      path("line", "M31.5 22.5l-2-3.75M35.75 21l.5-4.25M28 25.5l-3.75-1.5"),
    ],
  },
  locked: {
    use: "You cannot see this. A lock on the plate, and the plate is still there.",
    tone: "warning",
    shapes: [
      rect("object", 2, 32, 46, 22, 6),
      rect("bar", 8, 38, 18, 3.2, 1.6),
      rect("bar", 8, 44.5, 26, 2.6, 1.3),
      path("subject", "M39.5 26v-7.5a7.5 7.5 0 0 1 15 0V26h-4.5v-7.5a3 3 0 0 0-6 0V26z"),
      rect("subject", 34, 24, 26, 22, 5.5),
      circle("accent", 47, 33, 2.6),
      path("line", "M47 35v4.5"),
    ],
  },
} as const satisfies Record<string, Illustration>;

export type IllustrationName = keyof typeof illustrations;
