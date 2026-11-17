import { useEffect, useState } from "react";

export const TICK_MS = 250;

/** Seconds since the calling component mounted, refreshed a few times per second. */
export function useElapsedSeconds(): number {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const timer = setInterval((): void => {
      setNow(Date.now());
    }, TICK_MS);
    return (): void => {
      clearInterval(timer);
    };
  }, []);
  return (now - start) / 1000;
}
