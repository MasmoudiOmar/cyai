import {
  err,
  ok,
  type CandidateContext,
  type InterviewerProfile,
  type InterviewSpec,
  type Result,
  type Rubric,
} from "@cyai/spec";

import { checkBinding, type BindingMismatch } from "../shared/binding.js";

/** Everything needed to run one interview. Build it with `createContext` so bindings are checked. */
export interface InterviewContext {
  readonly interview: InterviewSpec;
  readonly profile: InterviewerProfile;
  readonly rubric: Rubric;
  readonly candidate: CandidateContext;
}

export function createContext(context: InterviewContext): Result<InterviewContext, BindingMismatch> {
  const mismatch =
    checkBinding("profile", context.interview.profileId, context.profile.id) ??
    checkBinding("rubric", context.interview.rubricId, context.rubric.id);
  return mismatch === undefined ? ok(context) : err(mismatch);
}
