import { at, evaluation, genericProfile } from "@cyai/fixtures";
import type { InterviewerProfile, Result } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import { drive, events, expectStatus, turn, unwrap, unwrapErr } from "../test-support/drive.js";
import type { SessionEvent } from "../session/events.js";
import type { BindingMismatch } from "../shared/binding.js";
import { decideNextStep, type NextStep } from "./next-step.js";

function nextAfter(
  history: readonly SessionEvent[],
  now = 600,
  profile: InterviewerProfile = genericProfile,
): Result<NextStep, BindingMismatch> {
  const session = expectStatus(drive(events.start(0), ...history), "awaiting_question");
  return decideNextStep(session, profile, at(now));
}

describe("decideNextStep", () => {
  it("asks the first question of a fresh session", () => {
    expect(unwrap(nextAfter([]))).toEqual({ kind: "new_question", number: 1 });
  });

  it("probes a vague answer with a follow-up on the same primary question", () => {
    expect(unwrap(nextAfter(turn(1, evaluation(2, ["vague"]))))).toEqual({
      kind: "follow_up",
      of: 0,
      triggers: ["vague"],
    });
  });

  it("stops probing once the follow-up budget for that question is spent", () => {
    const history = [...turn(1, evaluation(2, ["vague"])), ...turn(40, evaluation(2, ["no_example"]), 0)];
    expect(unwrap(nextAfter(history))).toEqual({ kind: "new_question", number: 2 });
  });

  it("ignores triggers the profile does not follow up on", () => {
    expect(unwrap(nextAfter(turn(1, evaluation(2, ["off_topic"]))))).toEqual({ kind: "new_question", number: 2 });
  });

  it("finishes when the question budget is used", () => {
    const history = [...turn(1, evaluation(4)), ...turn(40, evaluation(4))];
    expect(unwrap(nextAfter(history))).toEqual({ kind: "finish", reason: "question_budget" });
  });

  it("finishes when the time budget is used", () => {
    const totalSeconds = genericProfile.timing.totalMinutes * 60;
    expect(unwrap(nextAfter([], totalSeconds))).toEqual({ kind: "finish", reason: "time_budget" });
  });

  it("rejects a profile the session is not bound to", () => {
    const error = unwrapErr(nextAfter([], 1, { ...genericProfile, id: "other-profile" }));
    expect(error).toMatchObject({ code: "binding_mismatch", kind: "profile" });
  });
});
