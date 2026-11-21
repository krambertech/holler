import { buttonClasses } from "./ui/button";

/**
 * Shown at the top of every page once Slack reports Holler was removed. Sending is paused; drafts
 * and results stay. An owner can add Holler again from here. DECISIONS.md, Access.
 */
export function UninstalledNotice({ canReinstall }: { canReinstall: boolean }) {
  return (
    <div
      role="status"
      className="flex flex-col items-start gap-3 rounded-plate bg-waiting px-5 py-4 text-waiting-ink sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-normal">Holler is not in Slack right now</p>
        <p className="mt-0.5 text-sm">
          {canReinstall
            ? "Sending is paused until you add it again. Your drafts and results are safe."
            : "Sending is paused until an owner adds it again. Your drafts and results are safe."}
        </p>
      </div>
      {canReinstall && (
        <a href="/slack/oauth/install" className={buttonClasses("secondary", "sm")}>
          Add to Slack again
        </a>
      )}
    </div>
  );
}
