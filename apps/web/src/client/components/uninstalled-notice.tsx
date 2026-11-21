import { Unplug } from "lucide-react";
import type { ComponentProps } from "react";
import { Notice } from "./notice";
import { Button } from "./ui/button";

interface Props extends Omit<ComponentProps<typeof Notice>, "icon" | "title" | "description"> {
  /** True for an owner, who can add Holler to Slack again from here. */
  canReinstall: boolean;
}

/**
 * Shown at the top of every page once Slack reports Holler was removed. Sending is paused; drafts
 * and results stay. An owner can add Holler again from here. DECISIONS.md, Access.
 */
function UninstalledNotice({ canReinstall, ...props }: Props) {
  return (
    <Notice
      data-slot="uninstalled-notice"
      tone="warning"
      icon={<Unplug />}
      title="Holler is not in Slack right now"
      description={
        canReinstall
          ? "Sending is paused until you add it again. Your drafts and results are safe."
          : "Sending is paused until an owner adds it again. Your drafts and results are safe."
      }
      action={
        canReinstall && (
          <Button size="sm" render={<a href="/slack/oauth/install" />}>
            Add to Slack again
          </Button>
        )
      }
      {...props}
    />
  );
}

export { UninstalledNotice };
