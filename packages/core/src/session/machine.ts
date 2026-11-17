import {
  err,
  ok,
  type AskedQuestion,
  type IsoDateTime,
  type Result,
  type Scorecard,
  type Session,
  type SessionIn,
  type SessionStatus,
  type TurnEvaluation,
} from "@cyai/spec";

import { classifyOvertime, elapsedMs } from "../shared/time.js";
import type { SessionEvent, TransitionError } from "./events.js";
import { isActive, isIn, lastActivity, type ActiveSession, type StartedSession } from "./guards.js";

/** Result of moving a session into status `S`. */
export type Step<S extends SessionStatus> = Result<SessionIn<S>, TransitionError>;

type BaseFields = Pick<Session, "id" | "interviewId" | "profileId" | "rubricId" | "answerLimits" | "createdAt">;

function baseOf(session: Session): BaseFields {
  const { id, interviewId, profileId, rubricId, answerLimits, createdAt } = session;
  return { id, interviewId, profileId, rubricId, answerLimits, createdAt };
}

function startedOf(session: StartedSession): BaseFields & Pick<StartedSession, "startedAt" | "turns"> {
  return { ...baseOf(session), startedAt: session.startedAt, turns: session.turns };
}

/** Builds the next state only if `at` is not earlier than the session's last activity. */
function stamped<S extends SessionStatus>(
  session: Session,
  at: IsoDateTime,
  build: () => SessionIn<S>,
): Step<S> {
  const earliest = lastActivity(session);
  return elapsedMs(earliest, at) < 0 ? err({ code: "clock_skew", earliest, received: at }) : ok(build());
}

export function startSession(session: SessionIn<"created">, at: IsoDateTime): Step<"awaiting_question"> {
  return stamped(session, at, () => ({
    ...baseOf(session),
    status: "awaiting_question",
    startedAt: at,
    turns: [],
  }));
}

export function askQuestion(
  session: SessionIn<"awaiting_question">,
  question: AskedQuestion,
): Step<"awaiting_answer"> {
  const { followUpOf } = question;
  if (followUpOf !== undefined && followUpOf >= session.turns.length) {
    return err({ code: "unknown_follow_up_target", followUpOf, turnCount: session.turns.length });
  }
  return stamped(session, question.askedAt, () => ({
    ...startedOf(session),
    status: "awaiting_answer",
    pending: question,
  }));
}

export function answerQuestion(
  session: SessionIn<"awaiting_answer">,
  text: string,
  at: IsoDateTime,
): Step<"awaiting_evaluation"> {
  return stamped(session, at, () => {
    const duration = elapsedMs(session.pending.askedAt, at);
    return {
      ...startedOf(session),
      status: "awaiting_evaluation",
      answered: {
        index: session.turns.length,
        question: session.pending,
        answer: { text, answeredAt: at },
        elapsedMs: duration,
        overtime: classifyOvertime(duration, session.answerLimits),
      },
    };
  });
}

/** Records an evaluation. It is not checked against the rubric here: use `validateEvaluation` first. */
export function recordEvaluation(
  session: SessionIn<"awaiting_evaluation">,
  evaluation: TurnEvaluation,
): SessionIn<"awaiting_question"> {
  return {
    ...startedOf(session),
    status: "awaiting_question",
    turns: [...session.turns, { ...session.answered, evaluation }],
  };
}

export function finishSession(session: SessionIn<"awaiting_question">, at: IsoDateTime): Step<"scoring"> {
  return stamped(session, at, () => ({ ...startedOf(session), status: "scoring", endedAt: at }));
}

export function completeSession(session: SessionIn<"scoring">, scorecard: Scorecard): SessionIn<"completed"> {
  return { ...startedOf(session), status: "completed", endedAt: session.endedAt, scorecard };
}

export function abandonSession(session: ActiveSession, at: IsoDateTime, reason: string): Step<"abandoned"> {
  return stamped(session, at, () => ({
    ...baseOf(session),
    ...(isIn(session, "created") ? { turns: [] } : { startedAt: session.startedAt, turns: session.turns }),
    status: "abandoned",
    endedAt: at,
    reason,
  }));
}

type Transition = Result<Session, TransitionError>;

function invalid(session: Session, event: SessionEvent): Transition {
  return err({ code: "invalid_transition", from: session.status, event: event.type });
}

/** Applies `apply` only when the session is in `status`; otherwise an invalid-transition error. */
function when<S extends SessionStatus>(
  session: Session,
  status: S,
  event: SessionEvent,
  apply: (current: SessionIn<S>) => Transition,
): Transition {
  return isIn(session, status) ? apply(session) : invalid(session, event);
}

/** Event-driven entry point over the typed step functions. Pure: never mutates or throws. */
export function transition(session: Session, event: SessionEvent): Transition {
  switch (event.type) {
    case "start":
      return when(session, "created", event, (current) => startSession(current, event.at));
    case "ask":
      return when(session, "awaiting_question", event, (current) => askQuestion(current, event.question));
    case "answer":
      return when(session, "awaiting_answer", event, (current) => answerQuestion(current, event.text, event.at));
    case "evaluate":
      return when(session, "awaiting_evaluation", event, (current) => ok(recordEvaluation(current, event.evaluation)));
    case "finish":
      return when(session, "awaiting_question", event, (current) => finishSession(current, event.at));
    case "complete":
      return when(session, "scoring", event, (current) => ok(completeSession(current, event.scorecard)));
    case "abandon":
      return isActive(session) ? abandonSession(session, event.at, event.reason) : invalid(session, event);
  }
}
