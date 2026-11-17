import type { FollowUpTrigger, InterviewerProfile, IsoDateTime, SessionIn } from "@cyai/spec";

import { checkBinding, type BindingMismatch } from "../shared/binding.js";
import { err, ok, type Result } from "../shared/result.js";
import { elapsedMs, MS_PER_MINUTE } from "../shared/time.js";

export type NextStep =
  | {
      readonly kind: "follow_up";
      /** Index of the primary turn being probed. */
      readonly of: number;
      readonly triggers: readonly FollowUpTrigger[];
    }
  | { readonly kind: "new_question"; readonly number: number }
  | { readonly kind: "finish"; readonly reason: "question_budget" | "time_budget" };

/** Decides what the interviewer does next, following the profile's turn policy. */
export function decideNextStep(
  session: SessionIn<"awaiting_question">,
  profile: InterviewerProfile,
  now: IsoDateTime,
): Result<NextStep, BindingMismatch> {
  const mismatch = checkBinding("profile", session.profileId, profile.id);
  if (mismatch !== undefined) {
    return err(mismatch);
  }
  if (elapsedMs(session.startedAt, now) >= profile.timing.totalMinutes * MS_PER_MINUTE) {
    return ok({ kind: "finish", reason: "time_budget" });
  }

  const { turnPolicy } = profile;
  const last = session.turns.at(-1);
  if (last !== undefined) {
    const root = last.question.followUpOf ?? last.index;
    const triggers = last.evaluation.followUpTriggers.filter((trigger) =>
      turnPolicy.followUpTriggers.includes(trigger),
    );
    const followUps = session.turns.filter((turn) => turn.question.followUpOf === root).length;
    if (triggers.length > 0 && followUps < turnPolicy.maxFollowUpsPerQuestion) {
      return ok({ kind: "follow_up", of: root, triggers });
    }
  }

  const primaryQuestions = session.turns.filter((turn) => turn.question.followUpOf === undefined).length;
  if (primaryQuestions >= turnPolicy.maxQuestions) {
    return ok({ kind: "finish", reason: "question_budget" });
  }
  return ok({ kind: "new_question", number: primaryQuestions + 1 });
}
