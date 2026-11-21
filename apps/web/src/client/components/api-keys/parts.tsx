import { Check, Copy } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** A Settings section, drawn the same way as the ones settings.tsx draws itself. */
interface SettingsSectionProps extends Omit<ComponentProps<"section">, "title"> {
  /** The heading's id, which names the section. */
  id: string;
  title: string;
  description: ReactNode;
}

function SettingsSection({
  id,
  title,
  description,
  children,
  className,
  ...props
}: SettingsSectionProps) {
  return (
    <section
      data-slot="settings-section"
      aria-labelledby={id}
      className={cn("flex flex-col gap-3", className)}
      {...props}
    >
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
interface CopyButtonProps extends Omit<ComponentProps<typeof Button>, "onClick" | "children"> {
  text: string;
  /** What is copied, for screen readers: "Copy the MCP server address". */
  "aria-label": string;
}

function CopyButton({ text, size = "sm", ...props }: CopyButtonProps) {
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
        data-slot="copy-button"
        size={size}
        {...props}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setFailed(false);
            setCopied(true);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? <Check aria-hidden strokeWidth={2} /> : <Copy aria-hidden strokeWidth={2} />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : failed ? "Unable to copy. Select the text and copy it yourself." : ""}
      </span>
    </>
  );
}

export { CopyButton, SettingsSection };
