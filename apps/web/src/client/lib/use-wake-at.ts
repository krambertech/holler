import { useEffect, useReducer } from "react";

const LONGEST_TIMEOUT_MS = 2_147_483_647;

export function useWakeAt(at: Date | null | undefined): void {
  const [, wake] = useReducer((n: number) => n + 1, 0);
  const time = at?.getTime();
  useEffect(() => {
    if (time === undefined) return;
    const wait = time - Date.now();
    if (wait < 0) return;
    const timer = setTimeout(wake, Math.min(wait + 50, LONGEST_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [time]);
}
