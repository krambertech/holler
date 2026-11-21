import { useEffect, useState } from "react";

/**
 * The clock the Send stage reads, ticking every half minute. Pass one `now` to SendSettings and
 * the bar alike, so the close time they each print is the same minute. A fixed `now` stops it.
 */
export function useNow(fixed?: Date | undefined): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (fixed) return;
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [fixed]);
  return fixed ?? now;
}
