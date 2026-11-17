import { at, evaluation, genericProfile } from "@cyai/fixtures";
import type { Result } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import type { SessionEvent } from "../session/events.js";
import type { BindingMismatch } from "../shared/binding.js";
import { drive, events, expectStatus, turn, unwrap, unwrapErr } from "../test-support/drive.js";
import { fixtureContext } from "../test-support/interview.js";
import type { InterviewContext } from "./context.js";
import { planNext, type Instruction } from "./plan.js";

function planAfter(
  history: readonly SessionEvent[],
  context: InterviewContext = fixtureContext(),
): Result<Instruction, BindingMismatch> {
  const session = expectStatus(drive(events.start(0), ...history), "awaiting_question");
  return planNext(context, session, at(600));
}

describe("planNext", () => {
  it("asks the first fixed question as written", () => {
    expect(unwrap(planAfter([]))).toEqual({
      kind: "ask",
      question: { questionId: "q1", text: "Tell me about a time you followed a guideline you disagreed with." },
    });
  });

  it("requests a generated question for the next slot", () => {
    expect(unwrap(planAfter(turn(1, evaluation(4))))).toMatchObject({
      kind: "generate",
      questionId: "gen-2",
      request: { response: { name: "interview_question" } },
    });
  });

  it("requests a follow-up when the last answer was flagged", () => {
    const instruction = unwrap(planAfter(turn(1, evaluation(2, ["vague"]))));
    expect(instruction).toMatchObject({ kind: "generate", questionId: "fu-0-1", followUpOf: 0 });
  });

  it("finishes when the question bank runs out before the budget", () => {
    const profile = { ...genericProfile, turnPolicy: { ...genericProfile.turnPolicy, maxQuestions: 10 } };
    const history = [1, 40, 80].flatMap((seconds) => turn(seconds, evaluation(4)));
    expect(unwrap(planAfter(history, fixtureContext({ profile })))).toEqual({ kind: "finish", reason: "question_budget" });
  });

  it("passes the policy's finish decision through", () => {
    const history = [1, 40].flatMap((seconds) => turn(seconds, evaluation(4)));
    expect(unwrap(planAfter(history))).toEqual({ kind: "finish", reason: "question_budget" });
  });

  it("rejects a profile the session is not bound to", () => {
    const context = fixtureContext({ profile: { ...genericProfile, id: "other" } });
    expect(unwrapErr(planAfter([], context))).toMatchObject({ code: "binding_mismatch" });
  });
});
