import { Check, Copy } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** Where the public site documents the API and MCP. docs/api.md is the source. */
export const DOCS_URL = "https://holler.team/docs/api";

/** A Settings section, drawn the same way as the ones settings.tsx draws itself. */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h2 id={id} className="text-lg">
          {title}
        </h2>
        <p className="mt-0.5 max-w-[60ch] text-ink-2">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** Copies text and says so for a moment, out loud too. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <>
      <Button
        size="sm"
        icon={
          copied ? (
            <Check aria-hidden size={16} strokeWidth={2} />
          ) : (
            <Copy aria-hidden size={16} strokeWidth={2} />
          )
        }
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setFailed(false);
            setCopied(true);
          } catch {
            setFailed(true);
          }
        }}
        aria-label={label}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : failed ? "Unable to copy. Select the text and copy it yourself." : ""}
      </span>
    </>
  );
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "today", "yesterday", "3 days ago", then a date. */
export function whenLabel(iso: string, now = new Date()): string {
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(new Date(iso).setHours(0, 0, 0, 0)).getTime()) /
      86_400_000,
  );
  if (days >= 0 && days < 7) return relative.format(-days, "day");
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(
    new Date(iso),
  );
}
