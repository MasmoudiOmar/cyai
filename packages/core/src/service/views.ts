import type { AbandonedView, CompletedView, QuestionView, SessionIn } from "@cyai/spec";

import type { InterviewContext } from "../interview/context.js";

/** The question the candidate must answer now. */
export function questionView(context: InterviewContext, session: SessionIn<"awaiting_answer">): QuestionView {
  const { timing, turnPolicy } = context.profile;
  return {
    kind: "question",
    sessionId: session.id,
    role: context.interview.role,
    number: session.turns.length + 1,
    maxQuestions: turnPolicy.maxQuestions,
    text: session.pending.text,
    followUp: session.pending.followUpOf !== undefined,
    prepSeconds: timing.prepSeconds,
    softSeconds: timing.answer.softSeconds,
    hardSeconds: timing.answer.hardSeconds,
  };
}

/** The scored result with the labels needed to present it. */
export function completedView(context: InterviewContext, session: SessionIn<"completed">): CompletedView {
  return {
    kind: "completed",
    sessionId: session.id,
    role: context.interview.role,
    scorecard: session.scorecard,
    passThreshold: context.rubric.passThreshold,
    criteria: context.rubric.criteria.map(({ id, label }) => ({ id, label })),
    turns: session.turns,
  };
}

export function abandonedView(context: InterviewContext, session: SessionIn<"abandoned">): AbandonedView {
  return { kind: "abandoned", sessionId: session.id, role: context.interview.role, reason: session.reason };
}
