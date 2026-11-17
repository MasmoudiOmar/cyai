import {
  err,
  ok,
  type EvaluatedTurn,
  type FollowUpTrigger,
  type InterviewerProfile,
  type IsoDateTime,
  type Result,
  type SessionIn,
} from "@cyai/spec";

import { checkBinding, type BindingMismatch } from "../shared/binding.js";
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
/** Number of follow-ups already asked about the primary turn at `rootIndex`. */
export function followUpCount(turns: readonly EvaluatedTurn[], rootIndex: number): number {
  return turns.filter((turn) => turn.question.followUpOf === rootIndex).length;
}

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
    if (triggers.length > 0 && followUpCount(session.turns, root) < turnPolicy.maxFollowUpsPerQuestion) {
      return ok({ kind: "follow_up", of: root, triggers });
    }
  }

  const primaryQuestions = session.turns.filter((turn) => turn.question.followUpOf === undefined).length;
  if (primaryQuestions >= turnPolicy.maxQuestions) {
    return ok({ kind: "finish", reason: "question_budget" });
  }
  return ok({ kind: "new_question", number: primaryQuestions + 1 });
}
