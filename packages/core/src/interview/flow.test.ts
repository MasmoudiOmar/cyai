import { at, evaluation, genericProfile } from "@cyai/fixtures";
import type { SessionIn, TurnEvaluation } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import type { Clock } from "../ports/index.js";
import { drive, events, expectStatus, fixedIds, turn, unwrap, unwrapErr } from "../test-support/drive.js";
import { fixtureContext, manualClock } from "../test-support/interview.js";
import { advance, begin, conclude, evaluationRequest, provideQuestion, submitEvaluation } from "./flow.js";

const context = fixtureContext();
const mismatched = fixtureContext({ profile: { ...genericProfile, id: "other" } });

function awaitingQuestion(evaluations: readonly TurnEvaluation[]): SessionIn<"awaiting_question"> {
  const history = evaluations.flatMap((item, index) => turn(index * 40 + 1, item));
  return expectStatus(drive(events.start(0), ...history), "awaiting_question");
}

function fresh(): SessionIn<"awaiting_question"> {
  return awaitingQuestion([]);
}

function answered(): SessionIn<"awaiting_evaluation"> {
  return expectStatus(drive(events.start(0), events.ask(1), events.answer(30)), "awaiting_evaluation");
}

describe("begin", () => {
  it("creates and starts a session", () => {
    const session = unwrap(begin(context, { clock: manualClock(5), ids: fixedIds }));
    expect(session).toMatchObject({ status: "awaiting_question", createdAt: at(5), startedAt: at(5), turns: [] });
  });

  it("rejects a profile the interview is not bound to", () => {
    expect(unwrapErr(begin(mismatched, { clock: manualClock(), ids: fixedIds }))).toMatchObject({
      code: "binding_mismatch",
    });
  });

  it("rejects a clock that moves backwards between creation and start", () => {
    const readings = [10, 5];
    const clock: Clock = { now: () => new Date(Date.parse(at(readings.shift() ?? 0))) };
    expect(unwrapErr(begin(context, { clock, ids: fixedIds }))).toMatchObject({ code: "clock_skew" });
  });
});

describe("advance", () => {
  it("asks the next fixed question immediately", () => {
    const progress = unwrap(advance(context, fresh(), at(2)));
    expect(progress.kind).toBe("question");
    expect(progress.session).toMatchObject({ pending: { questionId: "q1", askedAt: at(2) } });
  });

  it("requests a generated question when the next slot needs one", () => {
    expect(unwrap(advance(context, awaitingQuestion([evaluation(4)]), at(100)))).toMatchObject({
      kind: "needs_question",
      instruction: { questionId: "gen-2" },
    });
  });

  it("concludes and scores when the interview is over", () => {
    const progress = unwrap(advance(context, awaitingQuestion([evaluation(4), evaluation(3)]), at(200)));
    expect(progress).toMatchObject({ kind: "completed", session: { scorecard: { overall: 3.5, passed: true } } });
  });

  it("refuses to ask before the session started", () => {
    expect(unwrapErr(advance(context, fresh(), at(-1)))).toMatchObject({ code: "clock_skew" });
  });

  it("propagates binding errors", () => {
    expect(unwrapErr(advance(mismatched, fresh(), at(2)))).toMatchObject({ code: "binding_mismatch" });
  });
});

describe("provideQuestion", () => {
  it("asks a supplied generated question under the planned id", () => {
    const progress = unwrap(provideQuestion(context, awaitingQuestion([evaluation(4)]), { text: "Why us?" }, at(100)));
    expect(progress.session).toMatchObject({ pending: { questionId: "gen-2", text: "Why us?" } });
  });

  it("carries the follow-up target into the asked question", () => {
    const session = awaitingQuestion([evaluation(2, ["vague"])]);
    const progress = unwrap(provideQuestion(context, session, { text: "Can you be specific?" }, at(100)));
    expect(progress.session).toMatchObject({ pending: { questionId: "fu-0-1", followUpOf: 0 } });
  });

  it("rejects a question when a fixed one is due", () => {
    expect(unwrapErr(provideQuestion(context, fresh(), { text: "Extra?" }, at(2)))).toEqual({
      code: "no_question_expected",
    });
  });

  it("concludes instead when the interview is over", () => {
    const session = awaitingQuestion([evaluation(4), evaluation(4)]);
    expect(unwrap(provideQuestion(context, session, { text: "Late?" }, at(200))).kind).toBe("completed");
  });

  it("rejects blank or malformed questions", () => {
    const session = awaitingQuestion([evaluation(4)]);
    expect(unwrapErr(provideQuestion(context, session, { text: "  " }, at(100)))).toMatchObject({
      code: "invalid_response",
      response: "interview_question",
    });
    expect(unwrapErr(provideQuestion(context, session, "Why us?", at(100)))).toEqual({
      code: "invalid_response",
      response: "interview_question",
      message: "(root): Invalid input: expected object, received string",
    });
  });

  it("rejects a question timestamped before the last answer", () => {
    expect(unwrapErr(provideQuestion(context, awaitingQuestion([evaluation(4)]), { text: "Why?" }, at(0)))).toMatchObject({
      code: "clock_skew",
    });
  });

  it("propagates binding errors", () => {
    expect(unwrapErr(provideQuestion(mismatched, fresh(), { text: "Why?" }, at(2)))).toMatchObject({
      code: "binding_mismatch",
    });
  });
});

describe("conclude", () => {
  it("cannot score a session without evaluated turns", () => {
    expect(unwrapErr(conclude(context, fresh(), at(5)))).toEqual({ code: "no_evaluated_turns" });
  });

  it("rejects an end time before the last activity", () => {
    expect(unwrapErr(conclude(context, awaitingQuestion([evaluation(4)]), at(0)))).toMatchObject({
      code: "clock_skew",
    });
  });
});

describe("evaluation", () => {
  it("builds the evaluation prompt for the answered turn", () => {
    expect(evaluationRequest(context, answered()).user).toContain("<answer>\nAn answer.\n</answer>");
  });

  it("records a valid evaluation and advances", () => {
    expect(unwrap(submitEvaluation(context, answered(), evaluation(4), at(31)))).toMatchObject({
      kind: "needs_question",
    });
  });

  it("rejects evaluations that do not match the format", () => {
    expect(unwrapErr(submitEvaluation(context, answered(), { scores: [] }, at(31)))).toMatchObject({
      code: "invalid_response",
      response: "answer_evaluation",
    });
  });

  it("rejects a criterion scored twice", () => {
    const [first] = evaluation(4).scores;
    const twice = { ...evaluation(4), scores: [first, first] };
    expect(unwrapErr(submitEvaluation(context, answered(), twice, at(31)))).toEqual({
      code: "duplicate_criterion",
      criterionId: "structure",
    });
  });
});
