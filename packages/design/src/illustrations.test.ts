import { describe, expect, it } from "vitest";
import { illustrationGrid, illustrations, type Layer, type Shape } from "./illustrations";

function flatten(
  shapes: readonly Shape[],
  tilt = 0,
): { shape: Exclude<Shape, { kind: "group" }>; tilt: number }[] {
  return shapes.flatMap((shape) =>
    shape.kind === "group" ? flatten(shape.shapes, tilt + (shape.rotate ?? 0)) : [{ shape, tilt }],
  );
}

type Point = readonly [number, number];

function outline(shapes: readonly Shape[]): Point[] {
  return shapes.flatMap((shape): Point[] => {
    if (shape.kind === "rect")
      return [
        [shape.x, shape.y],
        [shape.x + shape.w, shape.y],
        [shape.x, shape.y + shape.h],
        [shape.x + shape.w, shape.y + shape.h],
      ];
    if (shape.kind === "circle")
      return Array.from({ length: 8 }, (_, i): Point => [
        shape.cx + shape.r * Math.cos((i * Math.PI) / 4),
        shape.cy + shape.r * Math.sin((i * Math.PI) / 4),
      ]);
    if (shape.kind === "path") return [];
    const [ox, oy] = shape.origin ?? [32, 32];
    const [mx, my] = shape.move ?? [0, 0];
    const a = ((shape.rotate ?? 0) * Math.PI) / 180;
    return outline(shape.shapes).map(([x, y]): Point => [
      ox + (x - ox) * Math.cos(a) - (y - oy) * Math.sin(a) + mx,
      oy + (x - ox) * Math.sin(a) + (y - oy) * Math.cos(a) + my,
    ]);
  });
}

const count = (shapes: ReturnType<typeof flatten>, layer: Layer) =>
  shapes.filter(({ shape }) => shape.layer === layer).length;

describe.each(Object.entries(illustrations))("%s", (_, drawing) => {
  const shapes = flatten(drawing.shapes);

  it("says when to use it", () => {
    expect(drawing.use.length).toBeGreaterThan(20);
  });

  it("picks out a subject and at most one accent", () => {
    expect(count(shapes, "subject")).toBeGreaterThan(0);
    expect(count(shapes, "accent")).toBeLessThanOrEqual(1);
  });

  it("tilts no object more than 12 degrees", () => {
    for (const { shape, tilt } of shapes)
      if (shape.layer === "object") expect(Math.abs(tilt)).toBeLessThanOrEqual(12);
  });

  it("fills the grid, so every drawing looks the same size", () => {
    const points = outline(drawing.shapes);
    const span = (axis: 0 | 1) =>
      Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]));
    expect(Math.max(span(0), span(1))).toBeGreaterThanOrEqual(48);
  });

  it("stays on the grid", () => {
    const { size } = illustrationGrid;
    for (const { shape } of shapes) {
      if (shape.kind === "rect") {
        expect(shape.x).toBeGreaterThanOrEqual(0);
        expect(shape.y).toBeGreaterThanOrEqual(0);
        expect(shape.x + shape.w).toBeLessThanOrEqual(size);
        expect(shape.y + shape.h).toBeLessThanOrEqual(size);
      } else if (shape.kind === "circle") {
        expect(shape.cx - shape.r).toBeGreaterThanOrEqual(0);
        expect(shape.cy - shape.r).toBeGreaterThanOrEqual(0);
        expect(shape.cx + shape.r).toBeLessThanOrEqual(size);
        expect(shape.cy + shape.r).toBeLessThanOrEqual(size);
      }
    }
  });
});
