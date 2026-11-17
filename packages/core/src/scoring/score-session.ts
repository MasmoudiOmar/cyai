import {
  err,
  ok,
  type CriterionResult,
  type Result,
  type Rubric,
  type Scorecard,
  type SessionIn,
} from "@cyai/spec";

import { checkBinding, type BindingMismatch } from "../shared/binding.js";
import { mean, roundScore } from "../shared/math.js";
import { validateEvaluation, type EvaluationError } from "./validate-evaluation.js";

export type ScoringError =
  | BindingMismatch
  | EvaluationError
  | { readonly code: "no_evaluated_turns" }
  | { readonly code: "unscored_criterion"; readonly criterionId: string };

/** Aggregates per-turn evaluations into a rubric-weighted scorecard. */
export function scoreSession(
  session: SessionIn<"scoring">,
  rubric: Rubric,
): Result<Scorecard, ScoringError> {
  const mismatch = checkBinding("rubric", session.rubricId, rubric.id);
  if (mismatch !== undefined) {
    return err(mismatch);
  }
  if (session.turns.length === 0) {
    return err({ code: "no_evaluated_turns" });
  }
  for (const turn of session.turns) {
    const validation = validateEvaluation(turn.evaluation, rubric);
    if (!validation.ok) {
      return validation;
    }
  }

  const scores = session.turns.flatMap((turn) => turn.evaluation.scores);
  const criteria: CriterionResult[] = [];
  let overall = 0;
  for (const criterion of rubric.criteria) {
    const [first, ...rest] = scores
      .filter((score) => score.criterionId === criterion.id)
      .map((score) => score.score);
    if (first === undefined) {
      return err({ code: "unscored_criterion", criterionId: criterion.id });
    }
    const average = roundScore(mean([first, ...rest]));
    criteria.push({ criterionId: criterion.id, average, samples: rest.length + 1 });
    overall += criterion.weight * average;
  }

  const rounded = roundScore(overall);
  return ok({
    criteria,
    overall: rounded,
    passed: rounded >= rubric.passThreshold,
    evaluatedTurns: session.turns.length,
  });
}
