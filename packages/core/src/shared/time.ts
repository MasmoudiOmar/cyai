import type { AnswerLimits, IsoDateTime, Overtime } from "@cyai/spec";

const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;

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
