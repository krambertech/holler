import { Link, useNavigate } from "@tanstack/react-router";
import { Inbox, LogOut, Settings } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { Logo } from "./logo";
import { Avatar } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { TriggerChevron } from "./ui/overlay-list";

interface Member {
  name: string;
  slackUserId: string;
  avatarUrl: string | null;
}

interface Props extends ComponentProps<"header"> {
  me: Member | undefined;
  workspaceName?: string | undefined;
  onSignOut: () => void;
}

function AppHeader({ me, workspaceName, onSignOut, className, ...props }: Props) {
  const navigate = useNavigate();
  return (
    <header
      data-slot="app-header"
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      <Link to="/" aria-label="Holler home" className="rounded-control">
        <Logo />
      </Link>
      {me && (
        <nav aria-label="You" className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger className="-me-2 flex min-h-11 items-center gap-2 rounded-control px-2 py-1 text-base text-muted transition-colors hoverable:hover:bg-hover hoverable:hover:text-ink data-popup-open:bg-hover data-popup-open:text-ink">
              <Avatar name={me.name} seed={me.slackUserId} src={me.avatarUrl} />
              <span className="max-sm:sr-only">{me.name}</span>
              <span className="sr-only">, account</span>
              <TriggerChevron />
            </DropdownMenuTrigger>
            <DropdownMenuContent aria-label="Account" align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {workspaceName ? `${me.name} in ${workspaceName}` : me.name}
                </DropdownMenuLabel>
                <DropdownMenuLinkItem render={<Link to="/answers" />}>
                  <Inbox />
                  Your answers
                </DropdownMenuLinkItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                  <Settings />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onSignOut}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      )}
    </header>
  );
}

export { AppHeader };
