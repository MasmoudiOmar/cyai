import type { Session, SessionIn, SessionStatus } from "@cyai/spec";

import { err, ok, type Result } from "../shared/result.js";
import { classifyOvertime, elapsedMs } from "../shared/time.js";
import { eventTime, type SessionEvent, type TransitionError } from "./events.js";
import { isActive, isIn, lastActivity, type ActiveSession, type StartedSession } from "./guards.js";

type Transition = Result<Session, TransitionError>;
type EventOf<T extends SessionEvent["type"]> = Extract<SessionEvent, { type: T }>;
type BaseFields = Pick<
  Session,
  "id" | "interviewId" | "profileId" | "rubricId" | "answerLimits" | "createdAt"
>;

function baseOf(session: Session): BaseFields {
  const { id, interviewId, profileId, rubricId, answerLimits, createdAt } = session;
  return { id, interviewId, profileId, rubricId, answerLimits, createdAt };
}

function startedOf(session: StartedSession): BaseFields & Pick<StartedSession, "startedAt" | "turns"> {
  return { ...baseOf(session), startedAt: session.startedAt, turns: session.turns };
}

function invalid(session: Session, event: SessionEvent): Transition {
  return err({ code: "invalid_transition", from: session.status, event: event.type });
}

/** Applies `apply` only when the session is in `status`; otherwise an invalid-transition error. */
function when<S extends SessionStatus, E extends SessionEvent>(
  session: Session,
  status: S,
  event: E,
  apply: (current: SessionIn<S>, received: E) => Transition,
): Transition {
  return isIn(session, status) ? apply(session, event) : invalid(session, event);
}

function start(session: SessionIn<"created">, event: EventOf<"start">): Transition {
  return ok({ ...baseOf(session), status: "awaiting_question", startedAt: event.at, turns: [] });
}

function ask(session: SessionIn<"awaiting_question">, event: EventOf<"ask">): Transition {
  const { followUpOf } = event.question;
  if (followUpOf !== undefined && followUpOf >= session.turns.length) {
    return err({ code: "unknown_follow_up_target", followUpOf, turnCount: session.turns.length });
  }
  return ok({ ...startedOf(session), status: "awaiting_answer", pending: event.question });
}

function answer(session: SessionIn<"awaiting_answer">, event: EventOf<"answer">): Transition {
  const duration = elapsedMs(session.pending.askedAt, event.at);
  return ok({
    ...startedOf(session),
    status: "awaiting_evaluation",
    answered: {
      index: session.turns.length,
      question: session.pending,
      answer: { text: event.text, answeredAt: event.at },
      elapsedMs: duration,
      overtime: classifyOvertime(duration, session.answerLimits),
    },
  });
}

function evaluate(session: SessionIn<"awaiting_evaluation">, event: EventOf<"evaluate">): Transition {
  return ok({
    ...startedOf(session),
    status: "awaiting_question",
    turns: [...session.turns, { ...session.answered, evaluation: event.evaluation }],
  });
}

function finish(session: SessionIn<"awaiting_question">, event: EventOf<"finish">): Transition {
  return ok({ ...startedOf(session), status: "scoring", endedAt: event.at });
}

function complete(session: SessionIn<"scoring">, event: EventOf<"complete">): Transition {
  return ok({ ...startedOf(session), status: "completed", endedAt: session.endedAt, scorecard: event.scorecard });
}

function abandon(session: ActiveSession, event: EventOf<"abandon">): Transition {
  const progress = isIn(session, "created")
    ? { turns: [] }
    : { startedAt: session.startedAt, turns: session.turns };
  return ok({ ...baseOf(session), ...progress, status: "abandoned", endedAt: event.at, reason: event.reason });
}

/**
 * Pure state transition. Returns the next session or a typed error; never mutates or throws.
 * Evaluations are not checked against the rubric here: call `validateEvaluation` first.
 */
export function transition(session: Session, event: SessionEvent): Transition {
  const received = eventTime(event);
  const earliest = lastActivity(session);
  if (received !== undefined && elapsedMs(earliest, received) < 0) {
    return err({ code: "clock_skew", earliest, received });
  }
  switch (event.type) {
    case "start":
      return when(session, "created", event, start);
    case "ask":
      return when(session, "awaiting_question", event, ask);
    case "answer":
      return when(session, "awaiting_answer", event, answer);
    case "evaluate":
      return when(session, "awaiting_evaluation", event, evaluate);
    case "finish":
      return when(session, "awaiting_question", event, finish);
    case "complete":
      return when(session, "scoring", event, complete);
    case "abandon":
      return isActive(session) ? abandon(session, event) : invalid(session, event);
  }
}
