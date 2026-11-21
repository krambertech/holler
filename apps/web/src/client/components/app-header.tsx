import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";
import { Avatar } from "./ui/avatar";

/**
 * The slim header: the logo home on the left, the member on the right. The member opens Settings.
 * No navigation bar; Holler is one column.
 */
export function AppHeader({
  me,
}: {
  me: { name: string; slackUserId: string; avatarUrl: string | null } | undefined;
}) {
  return (
    <header className="flex items-center justify-between">
      <Link to="/" aria-label="Holler home" className="rounded-control">
        <Logo />
      </Link>
      {me && (
        <nav aria-label="You" className="flex items-center gap-1">
          <Link
            to="/answers"
            className="relative rounded-control px-2.5 py-1.5 text-base text-muted transition-colors hoverable:hover:bg-hover hoverable:hover:text-ink data-[status=active]:text-ink pointer-coarse:before:absolute pointer-coarse:before:-inset-1 pointer-coarse:before:content-['']"
          >
            Your answers
          </Link>
          <Link
            to="/settings"
            className="-me-2 flex items-center gap-2 rounded-control px-2 py-1 text-base text-muted transition-colors hoverable:hover:bg-hover hoverable:hover:text-ink"
          >
            <Avatar name={me.name} seed={me.slackUserId} src={me.avatarUrl} />
            <span className="max-sm:sr-only">{me.name}</span>
            <span className="sr-only">, Settings</span>
          </Link>
        </nav>
      )}
    </header>
  );
}
