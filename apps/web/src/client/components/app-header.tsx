import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";
import { Avatar } from "./ui/avatar";

/** The slim header: the logo home on the left, the member on the right. No navigation bar; Holler is one column. */
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
        <span className="flex items-center gap-2 text-md text-muted">
          <Avatar name={me.name} seed={me.slackUserId} src={me.avatarUrl} />
          <span className="hidden sm:inline">{me.name}</span>
        </span>
      )}
    </header>
  );
}
