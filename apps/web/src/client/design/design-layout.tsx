import { Dialog } from "@base-ui/react/dialog";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { Menu, Monitor, Moon, Sun, X } from "lucide-react";
import { useRef, useState } from "react";
import { Mark } from "@/components/logo";
import { cn } from "@/lib/cn";
import { setTheme, type ThemeChoice, useTheme } from "@/lib/theme";
import { DocLink } from "./doc-link";
import { FOUNDATIONS, GROUPS } from "./registry";

/**
 * The design system's own frame. A quiet contents column on the left, one page beside it. The
 * column is chrome, so it stays one step below the page: smaller text, no plates, no edges inside.
 */
export function DesignLayout() {
  const [menu, setMenu] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const panel = useRef<HTMLDivElement>(null);

  return (
    <div className="flex min-h-dvh bg-canvas text-ink">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-divider border-e lg:flex">
        <div className="flex h-16 items-center px-5">
          <Home />
        </div>
        <nav aria-label="Design system" className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-6">
          <Contents path={path} />
        </nav>
        <div className="flex items-center justify-between border-divider border-t px-5 py-3">
          <span className="text-muted text-sm">Theme</span>
          <ThemeSwitch />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-(--z-sticky) flex h-14 items-center gap-1 border-divider border-b bg-canvas px-3 lg:hidden">
          <button
            type="button"
            aria-label="Contents"
            aria-haspopup="dialog"
            onClick={() => setMenu(true)}
            className="grid size-9 place-items-center rounded-sm text-ink-2 transition-colors hover:bg-hover hover:text-ink"
          >
            <Menu size={18} strokeWidth={2} />
          </button>
          <Home />
          <span className="ms-auto">
            <ThemeSwitch />
          </span>
        </header>
        <Dialog.Root open={menu} onOpenChange={setMenu}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-(--z-dialog) bg-scrim transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
            <Dialog.Popup
              ref={panel}
              initialFocus={panel}
              className="fixed inset-y-0 start-0 z-(--z-dialog) flex w-72 max-w-[85vw] flex-col bg-canvas shadow-float outline-none transition-transform duration-250 ease-out data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full rtl:data-[ending-style]:translate-x-full rtl:data-[starting-style]:translate-x-full"
            >
              <div className="flex h-14 items-center justify-between px-4">
                <Dialog.Title className="font-normal text-ink">Design system</Dialog.Title>
                <Dialog.Close
                  aria-label="Close contents"
                  className="grid size-9 place-items-center rounded-sm text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                >
                  <X size={18} strokeWidth={2} />
                </Dialog.Close>
              </div>
              <nav
                aria-label="Design system"
                className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-6"
              >
                <Contents path={path} onNavigate={() => setMenu(false)} />
              </nav>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
        <main className="mx-auto w-full max-w-[1040px] flex-1 px-5 pt-12 pb-20 lg:px-14">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Home() {
  return (
    <DocLink
      href="/design/brand"
      aria-label="Holler design system"
      className="flex items-center gap-2 rounded-sm"
    >
      <Mark size={26} />
      <span aria-hidden className="flex items-baseline gap-1.5">
        <span className="font-semibold text-lg tracking-[-0.02em]">holler</span>
        <span className="text-base text-muted">design</span>
      </span>
    </DocLink>
  );
}

const themes: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System theme", Icon: Monitor },
  { value: "light", label: "Day", Icon: Sun },
  { value: "dark", label: "Night", Icon: Moon },
];

function ThemeSwitch() {
  const theme = useTheme();
  return (
    <fieldset className="m-0 flex gap-0.5 rounded-sm border-0 bg-track p-0.5">
      <legend className="sr-only">Theme</legend>
      {themes.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          aria-label={label}
          onClick={() => setTheme(value)}
          className={cn(
            "relative grid size-6 place-items-center rounded-xs text-muted transition-colors hoverable:hover:text-ink pointer-coarse:before:absolute pointer-coarse:before:-inset-2.5 pointer-coarse:before:content-['']",
            theme === value && "bg-plate text-ink shadow-[0_0_0_1px_var(--edge)]",
          )}
        >
          <Icon size={13} strokeWidth={2} />
        </button>
      ))}
    </fieldset>
  );
}

function Contents({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const sections = [
    {
      title: "Foundations",
      links: FOUNDATIONS.map((f) => ({ key: f.slug, title: f.title, href: `/design/${f.slug}` })),
    },
    {
      title: "Components",
      links: GROUPS.map((g) => ({
        key: g.slug,
        title: g.title,
        href: `/design/components/${g.slug}`,
      })),
    },
  ];
  return (
    <>
      {sections.map((section) => (
        <div key={section.title} className="mt-7 first:mt-0">
          <h2 className="px-2.5 pb-1.5 text-muted text-sm">{section.title}</h2>
          <ul className="grid gap-px">
            {section.links.map((link) => {
              const current = path === link.href;
              return (
                <li key={link.key}>
                  <DocLink
                    href={link.href}
                    aria-current={current ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "block rounded-sm px-2.5 py-[7px] text-base transition-colors",
                      current ? "bg-tint text-tint-ink" : "text-ink-2 hoverable:hover:text-ink",
                    )}
                  >
                    {link.title}
                  </DocLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}
