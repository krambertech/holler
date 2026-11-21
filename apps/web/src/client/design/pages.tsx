import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { DocLink } from "./doc-link";
import { Doc, DocSection, DocSource, Sub } from "./frame";
import { FOUNDATIONS, GROUPS, ORDER } from "./registry";

/** An unknown page goes to Brand. */
function ToBrand() {
  const router = useRouter();
  useEffect(() => {
    void router.navigate({ href: "/design/brand", replace: true });
  }, [router]);
  return null;
}

function useDocTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · Holler design`;
  }, [title]);
}

export function FoundationPage({ slug }: { slug: string }) {
  const page = FOUNDATIONS.find((f) => f.slug === slug);
  useDocTitle(page?.title);
  if (!page) return <ToBrand />;
  return (
    <DocSection.Provider value="Foundations">
      <DocSource.Provider value={page.source}>
        <page.Page />
        <DocFooter current={`page:${page.slug}`} />
      </DocSource.Provider>
    </DocSection.Provider>
  );
}

export function GroupPage({ slug }: { slug: string }) {
  const group = GROUPS.find((g) => g.slug === slug);
  useDocTitle(group?.title);
  if (!group) return <ToBrand />;
  return (
    <>
      <Doc title={group.title} lede={group.lede} crumb="Components">
        {group.entries.map((entry) => (
          <Sub key={entry.slug} title={entry.name} note={entry.note} source={entry.source}>
            <entry.Demo />
          </Sub>
        ))}
      </Doc>
      <DocFooter current={`group:${group.slug}`} />
    </>
  );
}

function DocFooter({ current }: { current: string }) {
  const at = ORDER.findIndex((d) => d.key === current);
  const prev = at > 0 ? ORDER[at - 1] : undefined;
  const next = at >= 0 ? ORDER[at + 1] : undefined;
  const step =
    "group flex min-w-0 items-center gap-3 rounded-md bg-plate px-4 py-3 shadow-[0_0_0_1px_var(--edge)] transition-colors hover:bg-well";
  return (
    <nav
      aria-label="Previous and next"
      className="mt-16 grid gap-3 border-edge border-t pt-8 md:grid-cols-2"
    >
      {prev ? (
        <DocLink href={prev.href} className={step}>
          <ArrowLeft aria-hidden size={16} strokeWidth={2} className="shrink-0 text-muted" />
          <span className="grid min-w-0">
            <span className="text-muted text-xs">Previous</span>
            <span className="truncate">{prev.title}</span>
          </span>
        </DocLink>
      ) : (
        <span />
      )}
      {next && (
        <DocLink href={next.href} className={`${step} justify-end text-end`}>
          <span className="grid min-w-0">
            <span className="text-muted text-xs">Next</span>
            <span className="truncate">{next.title}</span>
          </span>
          <ArrowRight aria-hidden size={16} strokeWidth={2} className="shrink-0 text-muted" />
        </DocLink>
      )}
    </nav>
  );
}
