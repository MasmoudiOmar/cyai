import type { InterviewerProfile, QuestionView } from "@cyai/spec";

export type InterviewClock = Pick<QuestionView, "prepSeconds" | "softSeconds" | "hardSeconds" | "turnTaking">;

/** The timing and turn-taking rules every interface shows the candidate. */
export function interviewClock({ timing, turnTaking }: InterviewerProfile): InterviewClock {
  return {
    prepSeconds: timing.prepSeconds,
    softSeconds: timing.answer.softSeconds,
    hardSeconds: timing.answer.hardSeconds,
    turnTaking,
  };
}
