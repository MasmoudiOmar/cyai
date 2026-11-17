import type { InterviewSummary, SessionSummary } from "@cyai/spec";
import type { JSX } from "react";

import type { ApiClient } from "../api.js";
import { Arrow, Icon } from "../components/Icon.js";
import { Loading } from "../components/Loading.js";
import { Ring } from "../components/ScoreRing.js";
import { SessionList } from "../components/SessionList.js";
import { formatOf, formatScore, humanize, isOpen } from "../format.js";
import { hrefFor } from "../route.js";
import { useLoad } from "../use-load.js";

const RECENT = 3;

function Preview(): JSX.Element {
  return (
    <div className="card preview" aria-hidden="true">
      <div className="preview-head">
        <span className="pill accent">
          <Icon name="live" size={14} /> Live adaptive
        </span>
        <span className="eyebrow">Question 2 of 5</span>
      </div>
      <p className="display preview-question">Walk me through the hardest bug you have tracked down.</p>
      <div className="preview-foot">
        <span className="preview-lines">
          <span />
          <span />
          <span />
        </span>
        <Ring progress={0.42} size={92} stroke={7} gradient className="timer">
          <strong>0:51</strong>
        </Ring>
      </div>
    </div>
  );
}

function Hero({ first }: { readonly first: InterviewSummary | undefined }): JSX.Element {
  return (
    <section className="hero">
      <div>
        <span className="pill">
          <span className="live-dot" /> Practice for AI-run interviews
        </span>
        <h1 className="display">
          Walk into your AI interview <em>already rehearsed.</em>
        </h1>
        <p className="lead">
          Async video screens and adaptive AI interviewers follow strict timing and scoring rules. Rehearse against the same
          rules, then get a scored debrief on every answer.
        </p>
        <div className="hero-actions">
          {first === undefined ? null : (
            <a className="button primary large" href={hrefFor({ page: "setup", interviewId: first.id })}>
              Start practising <Arrow />
            </a>
          )}
          <a className="button ghost large" href={hrefFor({ page: "history" })}>
            <Icon name="history" /> Your history
          </a>
        </div>
      </div>
      <Preview />
    </section>
  );
}

function InterviewCards({ interviews }: { readonly interviews: readonly InterviewSummary[] }): JSX.Element {
  if (interviews.length === 0) {
    return (
      <div className="empty">
        <Icon name="questions" size={28} />
        <p>No interviews are installed. Add templates to a folder listed in CYAI_TEMPLATES.</p>
      </div>
    );
  }
  return (
    <ul className="interview-grid">
      {interviews.map((interview) => {
        const format = formatOf(interview);
        return (
          <li key={interview.id}>
            <a className="card interview-card" href={hrefFor({ page: "setup", interviewId: interview.id })}>
              <span className="card-top">
                <span className={`icon-tile ${interview.format}`}>
                  <Icon name={format.icon} size={20} />
                </span>
                <span className="eyebrow">{format.label}</span>
              </span>
              <span>
                <h3 className="display">{interview.role}</h3>
                <span className="muted">{interview.profile}</span>
              </span>
              <span className="meta">
                {interview.turnTaking.answer === "spoken" ? (
                  <span className="pill accent">
                    <Icon name="speaker" size={14} /> Spoken
                  </span>
                ) : (
                  <span className="pill">
                    <Icon name="chat" size={14} /> Typed
                  </span>
                )}
                <span className="pill">
                  <Icon name="clock" size={14} /> {interview.totalMinutes} min
                </span>
                <span className="pill">
                  <Icon name="questions" size={14} /> Up to {interview.maxQuestions} questions
                </span>
              </span>
              <span className="go">
                Start interview <Icon name="arrow" />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Stats({ sessions }: { readonly sessions: readonly SessionSummary[] }): JSX.Element | null {
  const scores = sessions.flatMap((session) => (session.overall === undefined ? [] : [session.overall]));
  if (sessions.length === 0) {
    return null;
  }
  const best = scores.length === 0 ? "–" : formatScore(Math.max(...scores));
  const mean = scores.length === 0 ? "–" : formatScore(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  const items: readonly [string, string][] = [
    ["Sessions", String(sessions.length)],
    ["Completed", String(scores.length)],
    ["Best score", best],
    ["Average", mean],
  ];
  return (
    <dl className="card stats">
      {items.map(([label, value]) => (
        <div key={label} className="stat">
          <dt className="eyebrow">{label}</dt>
          <dd>
            <strong>{value}</strong>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ResumeBanner({
  sessions,
  interviews,
}: {
  readonly sessions: readonly SessionSummary[];
  readonly interviews: readonly InterviewSummary[];
}): JSX.Element | null {
  const open = sessions.find((session) => isOpen(session.status));
  if (open === undefined) {
    return null;
  }
  const role = interviews.find((interview) => interview.id === open.interviewId)?.role ?? humanize(open.interviewId);
  return (
    <div className="card resume-banner">
      <span className="icon-tile">
        <Icon name="hourglass" />
      </span>
      <p>
        <strong>You have an interview in progress</strong>
        <br />
        <span className="muted">{role}</span>
      </p>
      <a className="button primary" href={hrefFor({ page: "session", sessionId: open.sessionId })}>
        Continue <Arrow />
      </a>
    </div>
  );
}

export function HomePage({ api }: { readonly api: ApiClient }): JSX.Element {
  const interviews = useLoad("interviews", api.interviews);
  const sessions = useLoad("sessions", api.sessions);
  const list = interviews.current.state === "ready" ? interviews.current.value : [];
  return (
    <>
      <Hero first={list[0]} />
      {sessions.current.state === "ready" ? (
        <>
          <ResumeBanner sessions={sessions.current.value} interviews={list} />
          <Stats sessions={sessions.current.value} />
        </>
      ) : null}

      <div className="section-head">
        <h2 className="display">Choose your interview</h2>
        <span className="muted">Each one copies a real AI interviewer’s format, timing and rubric.</span>
      </div>
      <Loading loadable={interviews.current} label="Loading interviews" onRetry={interviews.reload}>
        {(value) => <InterviewCards interviews={value} />}
      </Loading>

      <div className="section-head">
        <h2 className="display">Recent sessions</h2>
        <a className="link" href={hrefFor({ page: "history" })}>
          See all <Icon name="arrow" size={15} />
        </a>
      </div>
      <Loading loadable={sessions.current} label="Loading sessions" onRetry={sessions.reload}>
        {(value) => <SessionList sessions={value.slice(0, RECENT)} interviews={list} />}
      </Loading>
    </>
  );
}
