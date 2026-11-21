import { useRouter } from "@tanstack/react-router";
import type { AnchorHTMLAttributes } from "react";

/**
 * A link inside the design site. The site has its own router, separate from the product's typed
 * routes, so links go by plain path and navigate client-side unless a modifier key asks for a tab.
 */
export function DocLink({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const router = useRouter();
  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.button !== 0
        )
          return;
        event.preventDefault();
        void router.navigate({ href });
      }}
      {...rest}
    />
  );
}
