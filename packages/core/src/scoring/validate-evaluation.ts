import type { Rubric, TurnEvaluation } from "@cyai/spec";

import { err, ok, type Result } from "../shared/result.js";

export interface EvaluationError {
  readonly code: "unknown_criterion" | "duplicate_criterion";
  readonly criterionId: string;
}

/** Checks that an evaluation scores only rubric criteria, each at most once. */
export function validateEvaluation(
  evaluation: TurnEvaluation,
  rubric: Rubric,
): Result<TurnEvaluation, EvaluationError> {
  const known = new Set(rubric.criteria.map((criterion) => criterion.id));
  const seen = new Set<string>();
  for (const { criterionId } of evaluation.scores) {
    if (!known.has(criterionId)) {
      return err({ code: "unknown_criterion", criterionId });
    }
    if (seen.has(criterionId)) {
      return err({ code: "duplicate_criterion", criterionId });
    }
    seen.add(criterionId);
  }
  return ok(evaluation);
}
