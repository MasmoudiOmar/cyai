import type { RefObject } from "react";

/** How much the level ring grows at full voice. */
const GAIN = 8;
const GROWTH = 0.6;

/** Scales the level ring directly, so a 20 Hz meter never re-renders React. */
export function showLevel(meter: RefObject<HTMLElement | null>, level: number): void {
  if (meter.current !== null) {
    meter.current.style.transform = `scale(${String(1 + Math.min(1, level * GAIN) * GROWTH)})`;
  }
}
