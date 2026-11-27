import { type ReactNode, useId } from "react";
import { PlateRow } from "@/components/ui/plate";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import type { RowSummary } from "./send-logic";

export const rowLinkClassName =
  "relative w-fit rounded-sm text-sm text-tint-ink outline-none focus-visible:ring-2 focus-visible:ring-focus hoverable:hover:underline pointer-coarse:before:absolute pointer-coarse:before:-inset-3 pointer-coarse:before:content-['']";

const rowGrid =
  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-5 py-3.5 text-start sm:grid-cols-[6rem_minmax(0,1fr)_auto]";

function Fact({ summary, value }: { summary: RowSummary; value?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="font-normal text-ink tabular">{value ?? summary.value}</span>
      <span className={cn("text-sm", summary.tone === "danger" ? "text-danger-ink" : "text-muted")}>
        {summary.description}
      </span>
    </span>
  );
}

function RowLabel({ id, children }: { id?: string | undefined; children: ReactNode }) {
  return (
    <span id={id} className="col-span-2 text-muted text-sm sm:col-span-1">
      {children}
    </span>
  );
}

function SendSettingsRow({
  label,
  summary,
  value,
  action,
  open,
  onToggle,
  children,
}: {
  label: string;
  summary: RowSummary;
  value?: ReactNode | undefined;
  action: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <PlateRow data-open={open || undefined}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          rowGrid,
          "min-h-14 outline-none transition-colors duration-150 hoverable:hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2",
        )}
      >
        <RowLabel>{label}</RowLabel>
        <Fact summary={summary} value={value} />
        <span className="text-primary text-sm">{action}</span>
      </button>
      <div
        id={panelId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-(--ease-out) motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="grid gap-4 px-5 pt-1 pb-5 sm:ps-33">{children}</div>
        </div>
      </div>
    </PlateRow>
  );
}

function SendSettingsSwitchRow({
  label,
  summary,
  checked,
  onCheckedChange,
  switchLabel,
  children,
}: {
  label: string;
  summary: RowSummary;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  switchLabel: string;
  children?: ReactNode;
}) {
  return (
    <PlateRow>
      <div className={cn(rowGrid, "min-h-14")}>
        <RowLabel>{label}</RowLabel>
        <Fact summary={summary} />
        <Switch aria-label={switchLabel} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {children}
    </PlateRow>
  );
}

export { SendSettingsRow, SendSettingsSwitchRow };
