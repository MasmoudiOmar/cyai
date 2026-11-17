import type { InterviewSummary, SessionSummary } from "@cyai/spec";
import type { JSX } from "react";

import { formatDate, humanize, isOpen, statusLabel } from "../format.js";
import { hrefFor } from "../route.js";
import { Icon } from "./Icon.js";
import { ScoreRing } from "./ScoreRing.js";

function StatusMark({ session }: { readonly session: SessionSummary }): JSX.Element {
  if (session.overall !== undefined) {
    return <ScoreRing score={session.overall} />;
  }
  return (
    <span className="icon-tile">
      <Icon name={isOpen(session.status) ? "hourglass" : "stop"} />
    </span>
  );
}

interface SessionListProps {
  readonly sessions: readonly SessionSummary[];
  readonly interviews: readonly InterviewSummary[];
}

/** Past and open sessions, newest first, each linking to its result or back into the interview. */
export function SessionList({ sessions, interviews }: SessionListProps): JSX.Element {
  if (sessions.length === 0) {
    return (
      <div className="empty">
        <Icon name="history" size={28} />
        <p>No sessions yet. Your practice history appears here.</p>
      </div>
    );
  }
  const roles = new Map(interviews.map((interview) => [interview.id, interview.role]));
  return (
    <ul className="card session-list">
      {sessions.map((session) => (
        <li key={session.sessionId}>
          <a className="session-row" href={hrefFor({ page: "session", sessionId: session.sessionId })}>
            <StatusMark session={session} />
            <span>
              <span className="title">{roles.get(session.interviewId) ?? humanize(session.interviewId)}</span>
              <br />
              <span className="when">{formatDate(session.createdAt)}</span>
            </span>
            <span className={isOpen(session.status) ? "pill accent" : "pill"}>
              {isOpen(session.status) ? "Continue" : statusLabel(session.status)}
            </span>
            <Icon name="chevron" />
          </a>
        </li>
      ))}
    </ul>
  );
}
