import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy } from "react";

// Vite replaces import.meta.env.DEV with false in production, so the import below is dropped.
const DesignPage = import.meta.env.DEV ? lazy(() => import("../dev/design-page")) : null;

export const Route = createFileRoute("/design")({
  beforeLoad: () => {
    if (!DesignPage) throw notFound();
  },
  component: () => (DesignPage ? <DesignPage /> : null),
});
