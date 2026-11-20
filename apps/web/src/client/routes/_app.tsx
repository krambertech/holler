import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { ApiError } from "@/lib/api";
import { meQuery } from "@/lib/queries";

/** Every signed-in screen: one column, a slim header, no sidebar. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(meQuery);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        throw redirect({ to: "/sign-in", search: { next: location.href } });
      }
      throw error;
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { data: me } = useQuery(meQuery);
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 pt-6 pb-12 sm:px-10 sm:pt-7 lg:px-20">
      <AppHeader me={me?.member} />
      <main className="flex flex-col gap-6">
        <Outlet />
      </main>
    </div>
  );
}
