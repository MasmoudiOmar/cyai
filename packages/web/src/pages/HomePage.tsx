import type { InterviewSummary, SessionSummary } from "@cyai/spec";
import type { JSX } from "react";

import type { ApiClient } from "../api.js";
import { Loading } from "../components/Loading.js";
import { formatDate, formatScore, statusLabel } from "../format.js";
import { hrefFor } from "../route.js";
import { useLoad } from "../use-load.js";

const FORMAT_LABELS: Readonly<Record<InterviewSummary["format"], string>> = {
  async: "Async video screen",
  live: "Live adaptive",
  chat: "Chat screener",
};

function InterviewCards({ interviews }: { readonly interviews: readonly InterviewSummary[] }): JSX.Element {
  if (interviews.length === 0) {
    return <p className="muted">No interviews are installed. Add templates to a folder listed in CYAI_TEMPLATES.</p>;
  }
  return (
    <ul className="grid">
      {interviews.map((interview) => (
        <li key={interview.id} className="card interview">
          <p className="eyebrow">{FORMAT_LABELS[interview.format]}</p>
          <h3>{interview.role}</h3>
          <p className="muted">{interview.profile}</p>
          <p className="facts">
            {interview.totalMinutes} min · up to {interview.maxQuestions} questions
          </p>
          <a className="button primary" href={hrefFor({ page: "setup", interviewId: interview.id })}>
            Practise
          </a>
        </li>
      ))}
    </ul>
  );
}

function SessionTable({ sessions }: { readonly sessions: readonly SessionSummary[] }): JSX.Element {
  if (sessions.length === 0) {
    return <p className="muted">No sessions yet. Your practice history appears here.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Interview</th>
            <th scope="col">Started</th>
            <th scope="col">Status</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.sessionId}>
              <td>
                <a href={hrefFor({ page: "session", sessionId: session.sessionId })}>{session.interviewId}</a>
              </td>
              <td>{formatDate(session.createdAt)}</td>
              <td>{statusLabel(session.status)}</td>
              <td>{session.overall === undefined ? "–" : formatScore(session.overall)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HomePage({ api }: { readonly api: ApiClient }): JSX.Element {
  const interviews = useLoad("interviews", api.interviews);
  const sessions = useLoad("sessions", api.sessions);
  return (
    <>
      <section className="hero">
        <h1>Practise for interviews run by AI</h1>
        <p className="lead">
          Async video screens and adaptive AI interviewers follow strict timing and scoring rules. Rehearse against the same
          rules, then read a scored debrief.
        </p>
      </section>
      <h2 className="section-title">Choose an interview</h2>
      <Loading loadable={interviews.current} label="Loading interviews…" onRetry={interviews.reload}>
        {(value) => <InterviewCards interviews={value} />}
      </Loading>
      <h2 className="section-title">Your sessions</h2>
      <Loading loadable={sessions.current} label="Loading sessions…" onRetry={sessions.reload}>
        {(value) => <SessionTable sessions={value} />}
      </Loading>
    </>
  );
}
