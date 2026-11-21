import { ArrowUpRight, Moon, Sun } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { cn } from "@/lib/cn";
import { useResolvedTheme } from "@/lib/theme";

const REPO = "https://github.com/krambertech/holler/blob/main/apps/web/src/client";

/** The file a page or component lives in, for its source link. */
export const DocSource = createContext<string | undefined>(undefined);

/** The section a page belongs to, shown above its title: Foundations or Components. */
export const DocSection = createContext<string | undefined>(undefined);

function SourceLink({ path }: { path: string }) {
  return (
    <a
      href={`${REPO}/${path}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex w-fit items-center gap-1 rounded-sm font-mono text-muted text-xs hover:text-ink"
    >
      {path}
      <ArrowUpRight aria-hidden size={12} strokeWidth={2} />
    </a>
  );
}

/** One page: a title, a lede that says what the page is for, then its sections. */
export function Doc({
  title,
  lede,
  crumb,
  children,
}: {
  title: string;
  lede?: ReactNode;
  crumb?: string;
  children: ReactNode;
}) {
  const source = useContext(DocSource);
  const inherited = useContext(DocSection);
  const section = crumb ?? inherited;
  return (
    <article>
      <header className="pb-10">
        {section && <div className="mb-2 text-muted text-sm">{section}</div>}
        <h1 className="text-4xl tracking-title">{title}</h1>
        {lede && <p className="mt-3 max-w-[64ch] text-ink-2 text-lg">{lede}</p>}
        {source && (
          <div className="mt-3">
            <SourceLink path={source} />
          </div>
        )}
      </header>
      <div className="grid">{children}</div>
    </article>
  );
}

/** A section of a page, divided from the one before by a hairline. */
export function Sub({
  title,
  note,
  source,
  children,
}: {
  title?: ReactNode;
  note?: ReactNode;
  source?: string;
  children?: ReactNode;
}) {
  return (
    <section className="grid gap-5 border-edge border-t py-10 first:border-t-0 first:pt-0">
      {(title || note) && (
        <div className="grid gap-1.5">
          {title && <h2 className="text-2xl">{title}</h2>}
          {note && <p className="max-w-[68ch] text-ink-2">{note}</p>}
          {source && <SourceLink path={source} />}
        </div>
      )}
      {children}
    </section>
  );
}

export interface Variant {
  label: string;
  /** When to use it, in one sentence. Set in mono so it never reads as part of the component. */
  note?: ReactNode;
  render: () => ReactNode;
}

/**
 * A component's variants on the canvas, one row each, with the label and its rule beside it. The
 * frame has its own day and night switch, so both can be checked without leaving the page.
 */
export function Variants({ items, stack = false }: { items: Variant[]; stack?: boolean }) {
  const page = useResolvedTheme();
  const [picked, setPicked] = useState<"light" | "dark" | null>(null);
  const theme = picked ?? page;
  const next = theme === "dark" ? "light" : "dark";
  return (
    <div
      data-theme={theme}
      className="relative overflow-hidden rounded-plate bg-canvas text-ink shadow-[0_0_0_1px_var(--edge)]"
    >
      <button
        type="button"
        aria-label={`Show these examples in the ${next === "dark" ? "night" : "day"} theme`}
        onClick={() => setPicked(next === page ? null : next)}
        className="absolute end-2.5 top-2.5 z-(--z-sticky) grid size-7 place-items-center rounded-sm text-muted transition-colors hoverable:hover:bg-hover hoverable:hover:text-ink pointer-coarse:size-11"
      >
        {theme === "dark" ? <Moon size={14} strokeWidth={2} /> : <Sun size={14} strokeWidth={2} />}
      </button>
      {items.map((variant, index) => (
        <div
          key={variant.label}
          className={cn(
            "grid",
            index > 0 && "border-divider border-t",
            !stack && "lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]",
          )}
        >
          <div className={cn("flex flex-col gap-1 px-5 pt-5", !stack && "lg:pb-5")}>
            <span className="font-normal">{variant.label}</span>
            {variant.note && (
              <span className="font-mono text-muted text-xs leading-relaxed">{variant.note}</span>
            )}
          </div>
          <div
            className={cn(
              "flex min-w-0 flex-wrap items-center gap-3 px-5 pb-5",
              stack ? "pt-3" : "pt-4 lg:pt-5",
            )}
          >
            {variant.render()}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A plain canvas to show one thing on, in the page's theme. */
export function Canvas({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-plate bg-canvas p-5 shadow-[0_0_0_1px_var(--edge)]", className)}>
      {children}
    </div>
  );
}

/** Two short lists: what to do and what not to. */
export function DoDont({ dos, donts }: { dos: ReactNode[]; donts: ReactNode[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[
        { title: "Do", items: dos, tone: "bg-answered text-answered-ink" },
        { title: "Don't", items: donts, tone: "bg-danger text-danger-ink" },
      ].map((list) => (
        <div key={list.title} className="rounded-plate bg-plate p-5 shadow-[0_0_0_1px_var(--edge)]">
          <span
            className={cn(
              "inline-flex h-6 items-center rounded-full px-2.5 font-normal text-sm",
              list.tone,
            )}
          >
            {list.title}
          </span>
          <ul className="mt-3 grid gap-2 text-ink-2">
            {list.items.map((item, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static prose, never reordered.
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
