import type { InterviewerProfile, InterviewSpec, SessionIn } from "@cyai/spec";

import type { Clock, IdGenerator } from "../ports/index.js";
import { checkBinding, type BindingMismatch } from "../shared/binding.js";
import { err, ok, type Result } from "../shared/result.js";

export interface CreateSessionInput {
  readonly interview: InterviewSpec;
  readonly profile: InterviewerProfile;
}

export interface CreateSessionDeps {
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** Creates a session, snapshotting the profile's answer limits so replays stay deterministic. */
export function createSession(
  { interview, profile }: CreateSessionInput,
  { clock, ids }: CreateSessionDeps,
): Result<SessionIn<"created">, BindingMismatch> {
  const mismatch = checkBinding("profile", interview.profileId, profile.id);
  if (mismatch !== undefined) {
    return err(mismatch);
  }
  return ok({
    status: "created",
    id: ids.next(),
    interviewId: interview.id,
    profileId: profile.id,
    rubricId: interview.rubricId,
    answerLimits: profile.timing.answer,
    createdAt: clock.now().toISOString(),
  });
}
