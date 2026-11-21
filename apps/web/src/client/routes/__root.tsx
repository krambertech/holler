import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-[720px] place-items-center px-4">
      <Plate className="w-full px-6 py-8">
        <h1 className="text-4xl tracking-title">There is nothing here</h1>
        <p className="mt-2 text-ink-2">The link may be old, or the page may not be built yet.</p>
        <Button render={<Link to="/" />} className="mt-5">
          Back to your hollers
        </Button>
      </Plate>
    </main>
  );
}
