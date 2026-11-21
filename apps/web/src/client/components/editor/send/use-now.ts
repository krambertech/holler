import { useEffect, useState } from "react";

export function useNow(fixed?: Date | undefined): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (fixed) return;
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [fixed]);
  return fixed ?? now;
}
