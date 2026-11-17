import { evaluation, starRubric } from "@cyai/fixtures";
import type { Rubric, Scorecard, TurnEvaluation } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import { drive, events, expectStatus, turn, unwrap, unwrapErr } from "../test-support/drive.js";
import type { Result } from "../shared/result.js";
import { scoreSession, type ScoringError } from "./score-session.js";
import { validateEvaluation } from "./validate-evaluation.js";

function scored(
  evaluations: readonly TurnEvaluation[],
  rubric: Rubric = starRubric,
): Result<Scorecard, ScoringError> {
  const history = evaluations.flatMap((item, index) => turn(index * 40 + 1, item));
  const session = expectStatus(drive(events.start(0), ...history, events.finish(1000)), "scoring");
  return scoreSession(session, rubric);
}

const scoreOnly = (criterionId: string, score = 3): TurnEvaluation => ({
  scores: [{ criterionId, score }],
  followUpTriggers: [],
  rationale: "Partial evaluation",
});

describe("scoreSession", () => {
  it("averages each criterion and weights the overall score", () => {
    expect(unwrap(scored([evaluation(4), evaluation(3)]))).toEqual({
      criteria: [
        { criterionId: "structure", average: 3.5, samples: 2 },
        { criterionId: "relevance", average: 3.5, samples: 2 },
      ],
      overall: 3.5,
      passed: true,
      evaluatedTurns: 2,
    });
  });

  it("fails below the pass threshold without floating-point drift", () => {
    const result = unwrap(scored([evaluation(3)], { ...starRubric, passThreshold: 3.6 }));
    expect(result).toMatchObject({ overall: 3, passed: false });
  });

  it("requires at least one evaluated turn", () => {
    expect(unwrapErr(scored([]))).toEqual({ code: "no_evaluated_turns" });
  });

  it("requires every rubric criterion to be scored", () => {
    expect(unwrapErr(scored([scoreOnly("structure")]))).toEqual({
      code: "unscored_criterion",
      criterionId: "relevance",
    });
  });

  it("rejects evaluations that reference unknown criteria", () => {
    expect(unwrapErr(scored([scoreOnly("charisma")]))).toEqual({
      code: "unknown_criterion",
      criterionId: "charisma",
    });
  });

  it("rejects a rubric the session is not bound to", () => {
    expect(unwrapErr(scored([evaluation(4)], { ...starRubric, id: "other-rubric" }))).toMatchObject({
      code: "binding_mismatch",
      kind: "rubric",
    });
  });
});

describe("validateEvaluation", () => {
  it("accepts an evaluation of known criteria", () => {
    expect(unwrap(validateEvaluation(evaluation(5), starRubric))).toEqual(evaluation(5));
  });

  it("rejects a criterion scored twice", () => {
    const once = scoreOnly("structure");
    const twice: TurnEvaluation = { ...once, scores: [...once.scores, ...once.scores] };
    expect(unwrapErr(validateEvaluation(twice, starRubric))).toEqual({
      code: "duplicate_criterion",
      criterionId: "structure",
    });
  });
});
