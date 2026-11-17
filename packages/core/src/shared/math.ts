const SCORE_PRECISION = 1e6;

/** Rounds away floating-point noise so threshold comparisons are stable. */
export function roundScore(value: number): number {
  return Math.round(value * SCORE_PRECISION) / SCORE_PRECISION;
}

/** Arithmetic mean of a non-empty list. */
export function mean(values: readonly [number, ...number[]]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
