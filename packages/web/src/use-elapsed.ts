import { useEffect, useState } from "react";

export const TICK_MS = 250;

/** The current time, refreshed a few times per second while `running`. */
export function useNow(running = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) {
      return undefined;
    }
    const timer = setInterval((): void => {
      setNow(Date.now());
    }, TICK_MS);
    return (): void => {
      clearInterval(timer);
    };
  }, [running]);
  return now;
}

/** Seconds since the calling component mounted. */
export function useElapsedSeconds(): number {
  const [start] = useState(() => Date.now());
  return (useNow() - start) / 1000;
}
