import {
  illustrationGrid as grid,
  type IllustrationName,
  illustrations,
  type Layer,
  type Shape,
} from "@holler/design";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "@/lib/cn";

export type IllustrationSize = keyof typeof grid.sizes;
export type IllustrationTone = "neutral" | "warning" | "danger";

const tones: Record<IllustrationTone, Pick<Record<Layer, Paint>, "subject" | "line" | "accent">> = {
  neutral: {
    subject: { fill: "fill-illo-neutral", stroke: "stroke-illo-neutral-ink" },
    line: { stroke: "stroke-illo-neutral-ink" },
    accent: { fill: "fill-primary" },
  },
  warning: {
    subject: { fill: "fill-illo-warning", stroke: "stroke-illo-warning-ink" },
    line: { stroke: "stroke-illo-warning-ink" },
    accent: { fill: "fill-waiting-dot" },
  },
  danger: {
    subject: { fill: "fill-illo-danger", stroke: "stroke-illo-danger-ink" },
    line: { stroke: "stroke-illo-danger-ink" },
    accent: { fill: "fill-danger-dot" },
  },
};

const quiet: Pick<Record<Layer, Paint>, "object" | "bar" | "ghost"> = {
  object: { fill: "fill-illo-object", stroke: "stroke-illo-line" },
  bar: { fill: "fill-illo-bar" },
  ghost: { stroke: "stroke-illo-line" },
};

const { step, fade } = grid.backdrop;
let gridLines = "";
for (let at = step / 2; at < grid.size; at += step)
  gridLines += `M${at} 0V${grid.size}M0 ${at}H${grid.size}`;

const detailWidthPx: Record<IllustrationSize, number> = { sm: 1.5, md: 1.75, lg: 2.25 };
const hairlinePx = 1.25;
const idSafeForSvgUrl = (id: string) => id.replace(/[^a-zA-Z0-9-]/g, "");

interface Props extends Omit<ComponentProps<"svg">, "children"> {
  name: IllustrationName;
  size?: IllustrationSize | undefined;
  tone?: IllustrationTone | undefined;
}

function Illustration({ name, size = "md", tone, className, ...props }: Props) {
  const drawing = illustrations[name];
  const resolved: IllustrationTone = tone ?? ("tone" in drawing ? drawing.tone : "neutral");
  const px = grid.sizes[size];
  const labelled = props["aria-label"] !== undefined;
  const fadeId = `illo-fade-${idSafeForSvgUrl(useId())}`;
  const tooSmallForDashesOrGrid = size === "sm";

  const layers: Record<Layer, Paint> = { ...quiet, ...tones[resolved] };

  function draw(
    shape: Exclude<Shape, { kind: "group" }>,
    key: string,
    paint: Paint,
    strokeWidth?: number,
    dash?: string,
  ) {
    const common = {
      className: cn(paint.fill ?? "fill-none", paint.stroke),
      strokeWidth: paint.stroke ? strokeWidth : undefined,
      strokeDasharray: dash,
      vectorEffect: "non-scaling-stroke",
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
    };
    if (shape.kind === "rect")
      return (
        <rect
          key={key}
          {...common}
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          rx={shape.r ?? 0}
        />
      );
    if (shape.kind === "circle")
      return <circle key={key} {...common} cx={shape.cx} cy={shape.cy} r={shape.r} />;
    return <path key={key} {...common} d={shape.d} />;
  }

  function paint(shapes: readonly Shape[], prefix: string): ReactNode[] {
    const out: ReactNode[] = [];
    let i = 0;
    while (i < shapes.length) {
      const shape = shapes[i] as Shape;
      const key = `${prefix}${i}`;
      if (shape.kind === "group") {
        const [ox, oy] = shape.origin ?? [32, 32];
        const [mx, my] = shape.move ?? [0, 0];
        out.push(
          <g
            key={key}
            transform={`translate(${mx} ${my}) rotate(${shape.rotate ?? 0} ${ox} ${oy})`}
          >
            {paint(shape.shapes, `${key}.`)}
          </g>,
        );
        i += 1;
        continue;
      }
      const layer = shape.layer;
      if (layer === "object" || layer === "subject") {
        let end = i;
        while (end < shapes.length) {
          const next = shapes[end] as Shape;
          if (next.kind === "group" || next.layer !== layer) break;
          end += 1;
        }
        const run = shapes.slice(i, end) as Exclude<Shape, { kind: "group" }>[];
        run.forEach((s, j) => {
          out.push(draw(s, `${key}o${j}`, layers[layer], hairlinePx * 2));
        });
        run.forEach((s, j) => {
          out.push(draw(s, `${key}f${j}`, { fill: layers[layer].fill }));
        });
        i = end;
        continue;
      }
      if (layer === "ghost" && tooSmallForDashesOrGrid) {
        out.push(draw(shape, key, layers.bar));
        i += 1;
        continue;
      }
      out.push(
        draw(
          shape,
          key,
          layers[layer],
          layer === "line" ? detailWidthPx[size] : hairlinePx,
          layer === "ghost" ? "3 2.5" : undefined,
        ),
      );
      i += 1;
    }
    return out;
  }

  return (
    <svg
      data-slot="illustration"
      data-name={name}
      width={px}
      height={px}
      viewBox={grid.viewBox}
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      focusable="false"
      className={cn("shrink-0 select-none overflow-visible", className)}
      {...props}
    >
      {!tooSmallForDashesOrGrid && (
        <>
          <defs>
            <radialGradient id={`${fadeId}-g`}>
              <stop offset={fade} stopColor="white" />
              <stop offset={1} stopColor="white" stopOpacity={0} />
            </radialGradient>
            <mask
              id={fadeId}
              maskUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={grid.size}
              height={grid.size}
            >
              <rect width={grid.size} height={grid.size} fill={`url(#${fadeId}-g)`} />
            </mask>
          </defs>
          <path
            d={gridLines}
            mask={`url(#${fadeId})`}
            className="fill-none stroke-illo-grid"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
      {paint(drawing.shapes, "s")}
    </svg>
  );
}

interface Paint {
  fill?: string | undefined;
  stroke?: string | undefined;
}

export { Illustration };
