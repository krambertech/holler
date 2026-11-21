import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  redirect,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "../src/client/components/ui/toast";
import { TooltipProvider } from "../src/client/components/ui/tooltip";
import { DesignLayout } from "../src/client/design/design-layout";
import { FoundationPage, GroupPage } from "../src/client/design/pages";
import "./styles.css";

const toBrand = () => {
  throw redirect({ href: "/design/brand" });
};

const root = createRootRoute({ component: Outlet });
const index = createRoute({ getParentRoute: () => root, path: "/", beforeLoad: toBrand });
const design = createRoute({
  getParentRoute: () => root,
  path: "/design",
  component: DesignLayout,
});
const designIndex = createRoute({ getParentRoute: () => design, path: "/", beforeLoad: toBrand });
const foundation = createRoute({
  getParentRoute: () => design,
  path: "$page",
  component: function Foundation() {
    // The design router is not the product router Register knows, so its params are read untyped.
    const { page } = foundation.useParams() as unknown as { page: string };
    return <FoundationPage slug={page} />;
  },
});
const group = createRoute({
  getParentRoute: () => design,
  path: "components/$group",
  component: function Group() {
    const { group: slug } = group.useParams() as unknown as { group: string };
    return <GroupPage slug={slug} />;
  },
});

const router = createRouter({
  routeTree: root.addChildren([index, design.addChildren([designIndex, foundation, group])]),
  scrollRestoration: true,
});

// Parts that hold a mutation, such as Upgrade to Team, need a client. Nothing here fetches.
const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false } } });

const element = document.getElementById("root");
if (!element) throw new Error("#root is missing");
createRoot(element).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster aria-label="Notifications" closeLabel="Dismiss" />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
