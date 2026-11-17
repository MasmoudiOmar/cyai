import type { IsoDateTime, Session, SessionIn, SessionStatus } from "@cyai/spec";

/** A session that has started and is not terminal. */
export type ActiveSession = Exclude<Session, SessionIn<"completed"> | SessionIn<"abandoned">>;

/** A session with `startedAt` and `turns`, i.e. past `created`. */
export type StartedSession = Exclude<ActiveSession, SessionIn<"created">>;

export function isIn<S extends SessionStatus>(session: Session, status: S): session is SessionIn<S> {
  return session.status === status;
}

export function isActive(session: Session): session is ActiveSession {
  return session.status !== "completed" && session.status !== "abandoned";
}

/** The most recent timestamp recorded in the session. New events may not precede it. */
export function lastActivity(session: Session): IsoDateTime {
  switch (session.status) {
    case "created":
      return session.createdAt;
    case "awaiting_question":
      return session.turns.at(-1)?.answer.answeredAt ?? session.startedAt;
    case "awaiting_answer":
      return session.pending.askedAt;
    case "awaiting_evaluation":
      return session.answered.answer.answeredAt;
    case "scoring":
    case "completed":
    case "abandoned":
      return session.endedAt;
  }
}
