import { aiTrainerInterview, at, EPOCH_MS, genericProfile, SESSION_ID } from "@cyai/fixtures";
import type {
  AskedQuestion,
  Scorecard,
  Session,
  SessionIn,
  SessionStatus,
  TurnEvaluation,
} from "@cyai/spec";

import type { Clock, IdGenerator } from "../ports/index.js";
import { createSession } from "../session/create.js";
import type { SessionEvent } from "../session/events.js";
import { isIn } from "../session/guards.js";
import { transition } from "../session/machine.js";
import type { Result } from "../shared/result.js";

export const fixedClock: Clock = { now: () => new Date(EPOCH_MS) };
export const fixedIds: IdGenerator = { next: () => SESSION_ID };

/** Returns the success value or fails the test with the error payload. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`Expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** Returns the error payload or fails the test. */
export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (result.ok) {
    throw new Error(`Expected error, got ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

/** Narrows a session to `status` or fails the test. */
export function expectStatus<S extends SessionStatus>(session: Session, status: S): SessionIn<S> {
  if (!isIn(session, status)) {
    throw new Error(`Expected status ${status}, got ${session.status}`);
  }
  return session;
}

export function newSession(): SessionIn<"created"> {
  return unwrap(
    createSession({ interview: aiTrainerInterview, profile: genericProfile }, { clock: fixedClock, ids: fixedIds }),
  );
}

/** Applies events in order from a fresh session, failing on the first error. */
export function drive(...events: readonly SessionEvent[]): Session {
  return events.reduce<Session>((session, event) => unwrap(transition(session, event)), newSession());
}

export const events = {
  start: (seconds: number): SessionEvent => ({ type: "start", at: at(seconds) }),
  ask: (seconds: number, followUpOf?: number): SessionEvent => {
    const question: AskedQuestion = { questionId: "q1", text: "Tell me about yourself.", askedAt: at(seconds) };
    return { type: "ask", question: followUpOf === undefined ? question : { ...question, followUpOf } };
  },
  answer: (seconds: number): SessionEvent => ({ type: "answer", text: "An answer.", at: at(seconds) }),
  evaluate: (evaluation: TurnEvaluation): SessionEvent => ({ type: "evaluate", evaluation }),
  finish: (seconds: number): SessionEvent => ({ type: "finish", at: at(seconds) }),
  complete: (scorecard: Scorecard): SessionEvent => ({ type: "complete", scorecard }),
  abandon: (seconds: number): SessionEvent => ({ type: "abandon", at: at(seconds), reason: "Closed the tab" }),
} as const;

/** One asked, answered and evaluated turn starting at `seconds`. */
export function turn(seconds: number, evaluation: TurnEvaluation, followUpOf?: number): SessionEvent[] {
  return [events.ask(seconds, followUpOf), events.answer(seconds + 30), events.evaluate(evaluation)];
}
