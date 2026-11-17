import type { AnswerLimits, IsoDateTime, Overtime } from "@cyai/spec";

import type { Clock } from "../ports/index.js";

const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;

/** The clock's current time as an ISO timestamp. */
export function nowIso(clock: Clock): IsoDateTime {
  return clock.now().toISOString();
}

/** Milliseconds from `from` to `to`; negative when `to` is earlier. */
export function elapsedMs(from: IsoDateTime, to: IsoDateTime): number {
  return Date.parse(to) - Date.parse(from);
}

/** Classifies an answer duration against the profile's soft and hard limits. */
export function classifyOvertime(durationMs: number, limits: AnswerLimits): Overtime {
  if (durationMs > limits.hardSeconds * MS_PER_SECOND) {
    return "hard";
  }
  if (durationMs > limits.softSeconds * MS_PER_SECOND) {
    return "soft";
  }
  return "none";
}
