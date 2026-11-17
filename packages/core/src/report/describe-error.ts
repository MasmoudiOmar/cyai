import type { CatalogError } from "../catalog/catalog.js";
import type { FlowError } from "../interview/flow.js";
import type { ModelError, StoreError } from "../ports/index.js";

/** Every error the engine and its ports can produce. */
export type CyaiError = FlowError | ModelError | StoreError | CatalogError;

/** A neutral, one-line explanation of an engine error. */
export function describeError(error: CyaiError): string {
  switch (error.code) {
    case "invalid_response":
      return `The ${error.response} is invalid: ${error.message}.`;
    case "unknown_criterion":
      return `Criterion "${error.criterionId}" is not in the rubric.`;
    case "duplicate_criterion":
      return `Criterion "${error.criterionId}" was scored twice.`;
    case "unscored_criterion":
      return `Criterion "${error.criterionId}" was never scored, so the interview cannot be graded.`;
    case "no_evaluated_turns":
      return "No answers were evaluated, so there is nothing to score.";
    case "no_question_expected":
      return "The next question is predefined, so no generated question is needed.";
    case "unknown_template":
      return `Unknown ${error.kind} "${error.id}".`;
    case "duplicate_template":
      return `Two ${error.kind} templates share the id "${error.id}".`;
    case "binding_mismatch":
      return `The interview expects ${error.kind} "${error.expected}" but got "${error.received}".`;
    case "store_error":
      return `Session storage failed (${error.reason}): ${error.message}`;
    case "model_error":
      return `The model request failed (${error.reason}): ${error.message}`;
    case "clock_skew":
      return `The system clock went backwards (${error.received} is before ${error.earliest}).`;
    case "invalid_transition":
      return `Cannot ${error.event} a session that is "${error.from}".`;
    case "unknown_follow_up_target":
      return `A follow-up refers to question ${String(error.followUpOf + 1)}, but only ${String(error.turnCount)} exist.`;
  }
}
