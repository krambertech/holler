import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { toast } from "@/components/ui/toast";
import { UninstalledNotice } from "@/components/uninstalled-notice";
import { ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { meQuery } from "@/lib/queries";

/** Every signed-in screen: one column, a slim header, no sidebar. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(meQuery);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        // Signed in with Slack but not a member: their workspace has not installed Holler.
        const session = await authClient.getSession();
        if (session.data) throw redirect({ to: "/install" });
        throw redirect({ to: "/sign-in", search: { next: location.href } });
      }
      throw error;
    }
  },
  component: AppLayout,
});

async function signOut() {
  const { error } = await authClient.signOut();
  if (error) {
    toast.add({ title: "Holler could not sign you out. Try again in a moment." });
    return;
  }
  window.location.assign("/sign-in");
}

function AppLayout() {
  const { data: me } = useQuery(meQuery);
  // Settings says it in the workspace's own plate, with the button beside it.
  const onSettings = useLocation({ select: (l) => l.pathname === "/settings" });
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 pt-6 pb-12 sm:px-10 sm:pt-7 lg:px-20">
      <AppHeader me={me?.member} workspaceName={me?.workspace.name} onSignOut={signOut} />
      {me && !me.workspace.installed && !onSettings && (
        <UninstalledNotice canReinstall={me.member.role === "owner"} />
      )}
      <main className="flex flex-col gap-6">
        <Outlet />
      </main>
    </div>
  );
}
