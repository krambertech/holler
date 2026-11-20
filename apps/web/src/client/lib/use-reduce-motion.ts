import { useReducedMotion } from "motion/react";

/**
 * Whether to skip motion: the OS setting, or the design page's switch. Use this, never motion's
 * hook directly; Biome enforces it.
 */
export function useReduceMotion(): boolean {
  const os = useReducedMotion() ?? false;
  const forced =
    typeof document !== "undefined" && document.documentElement.dataset.motion === "reduce";
  return os || forced;
}
