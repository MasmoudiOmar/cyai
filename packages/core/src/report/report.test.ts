import { aiTrainerInterview, at, createdSession, evaluation, genericProfile, scorecardOf, starRubric, unwrap } from "@cyai/fixtures";
import type { EvaluatedTurn } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import { buildCatalog } from "../catalog/catalog.js";
import { formatDebrief, formatScore } from "./debrief.js";
import { describeError, type CyaiError } from "./describe-error.js";
import { formatInterviewTable, formatSessionTable, summarizeInterviews, summarizeSession } from "./summaries.js";

describe("describeError", () => {
  const cases: readonly [CyaiError, string][] = [
    [{ code: "invalid_response", response: "answer_evaluation", message: "scores: too small" }, "The answer_evaluation is invalid: scores: too small."],
    [{ code: "unknown_criterion", criterionId: "x" }, 'Criterion "x" is not in the rubric.'],
    [{ code: "duplicate_criterion", criterionId: "x" }, 'Criterion "x" was scored twice.'],
    [{ code: "unscored_criterion", criterionId: "x" }, 'Criterion "x" was never scored, so the interview cannot be graded.'],
    [{ code: "no_evaluated_turns" }, "No answers were evaluated, so there is nothing to score."],
    [{ code: "no_question_expected" }, "The next question is predefined, so no generated question is needed."],
    [{ code: "unknown_template", kind: "interview", id: "x" }, 'Unknown interview "x".'],
    [{ code: "duplicate_template", kind: "rubric", id: "x" }, 'Two rubric templates share the id "x".'],
    [{ code: "binding_mismatch", kind: "profile", expected: "a", received: "b" }, 'The interview expects profile "a" but got "b".'],
    [{ code: "store_error", reason: "io", message: "disk full" }, "Session storage failed (io): disk full"],
    [{ code: "model_error", reason: "auth", message: "bad key" }, "The model request failed (auth): bad key"],
    [{ code: "clock_skew", earliest: at(5), received: at(1) }, `The system clock went backwards (${at(1)} is before ${at(5)}).`],
    [{ code: "invalid_transition", from: "completed", event: "answer" }, 'Cannot answer a session that is "completed".'],
    [{ code: "unknown_follow_up_target", followUpOf: 3, turnCount: 1 }, "A follow-up refers to question 4, but only 1 exist."],
  ];

  it.each(cases)("explains %j", (error, message) => {
    expect(describeError(error)).toBe(message);
  });
});

describe("formatDebrief", () => {
  const turn: EvaluatedTurn = {
    index: 0,
    question: { questionId: "q1", text: "Tell me about yourself.", askedAt: at(0) },
    answer: { text: "An answer.", answeredAt: at(10) },
    elapsedMs: 10_000,
    overtime: "none",
    evaluation: evaluation(4),
  };
  const scorecard = scorecardOf(4);

  it("shows the result, the per-criterion table and per-question feedback", () => {
    const text = formatDebrief("AI Trainer", scorecard, [turn]);
    expect(text).toContain("## Interview complete: AI Trainer");
    expect(text).toContain("Overall **4.00/5**: pass.");
    expect(text).toContain("| structure | 4.00 | 1 |");
    expect(text).toContain("**Q1.** Tell me about yourself.\nFixture evaluation");
    expect(formatDebrief("AI Trainer", { ...scorecard, passed: false }, [])).toContain("below the pass mark");
  });

  it("formats scores with two decimals", () => {
    expect(formatScore(3.456)).toBe("3.46");
  });
});

describe("summaries", () => {
  it("summarizes interviews with an installed profile", () => {
    const orphan = { ...aiTrainerInterview, id: "orphan", profileId: "missing-profile" };
    const catalog = unwrap(
      buildCatalog({ profiles: [genericProfile], rubrics: [starRubric], interviews: [aiTrainerInterview, orphan] }),
    );
    const summaries = summarizeInterviews(catalog);
    expect(summaries.map((item) => item.id)).toEqual([aiTrainerInterview.id]);
    expect(formatInterviewTable(summaries)).toContain(
      "| ai-trainer-generalist | AI Trainer | Adaptive AI Interviewer (generic) (live) | 25 min | up to 2 |",
    );
    expect(formatInterviewTable([])).toBe("No interviews are installed.");
  });

  it("summarizes sessions, with the overall score once completed", () => {
    const created = summarizeSession({ session: createdSession(), candidate: {} });
    expect(created).not.toHaveProperty("overall");
    expect(formatSessionTable([created])).toContain(`| created | ${at(0)} | - |`);
    expect(formatSessionTable([{ ...created, status: "completed", overall: 3.456 }])).toContain("| 3.46 |");
    expect(formatSessionTable([])).toBe("No practice sessions yet.");
  });
});
