import type { InterviewSummary } from "@cyai/spec";
import { useState, type JSX } from "react";

import type { ApiClient } from "../api.js";
import { DropField } from "../components/DropField.js";
import { Arrow, Icon, type IconName } from "../components/Icon.js";
import { Loading } from "../components/Loading.js";
import { Notice } from "../components/Notice.js";
import { FORMATS, formatSeconds } from "../format.js";
import { hrefFor, navigate } from "../route.js";
import { useLoad } from "../use-load.js";

function timing(interview: InterviewSummary): string {
  const answer = `aim for ${formatSeconds(interview.softSeconds)} per answer, cut off at ${formatSeconds(interview.hardSeconds)}`;
  return interview.prepSeconds > 0 ? `${String(interview.prepSeconds)}s to prepare, then ${answer}` : `No prep time: ${answer}`;
}

function Brief({ interview }: { readonly interview: InterviewSummary }): JSX.Element {
  const format = FORMATS[interview.format];
  const expectations: readonly [IconName, string, string][] = [
    ["clock", `${String(interview.totalMinutes)} minutes`, "The length of the real screen."],
    ["questions", `Up to ${String(interview.maxQuestions)} questions`, "Vague answers get follow-ups, as they would live."],
    ["hourglass", "Timed answers", timing(interview)],
    ["spark", "Scored debrief", "Every answer is graded against the interviewer’s rubric."],
  ];
  return (
    <aside className="card pad brief">
      <span className="card-top">
        <span className={`icon-tile ${interview.format}`}>
          <Icon name={format.icon} size={20} />
        </span>
        <span className="eyebrow">{format.label}</span>
      </span>
      <h1 className="display">{interview.role}</h1>
      <p className="muted">{interview.profile}</p>
      <ul className="expect">
        {expectations.map(([icon, title, detail]) => (
          <li key={title}>
            <Icon name={icon} />
            <span>
              <strong>{title}</strong>
              <span className="muted">{detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function SetupForm({ api, interview }: { readonly api: ApiClient; readonly interview: InterviewSummary }): JSX.Element {
  const [resume, setResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const start = (): void => {
    setBusy(true);
    setError(undefined);
    void api.start({ interviewId: interview.id, resume, jobDescription }).then((result) => {
      if (result.ok) {
        navigate({ page: "session", sessionId: result.value.sessionId });
        return;
      }
      setBusy(false);
      setError(result.error);
    });
  };

  return (
    <>
      <a className="back" href={hrefFor({ page: "home" })}>
        <Icon name="back" size={16} /> All interviews
      </a>
      <div className="setup">
        <Brief interview={interview} />
        <section className="card pad form">
          <h2 className="display">Tailor it to you</h2>
          <p className="muted">Share your resume and the job posting and the interviewer will ask about your experience.</p>
          <DropField id="resume" label="Resume" placeholder="Paste your resume…" value={resume} onChange={setResume} />
          <DropField
            id="job-description"
            label="Job description"
            placeholder="Paste the job posting…"
            value={jobDescription}
            onChange={setJobDescription}
          />
          <p className="privacy">
            <Icon name="lock" size={15} />
            Stored on this computer only. The interviewer model sees what it needs to ask and grade.
          </p>
          {error === undefined ? null : <Notice message={error} />}
          <button type="button" className="button primary large block" disabled={busy} onClick={start}>
            {busy ? "Preparing your interview…" : "Start interview"} <Arrow />
          </button>
        </section>
      </div>
    </>
  );
}

export function SetupPage({ api, interviewId }: { readonly api: ApiClient; readonly interviewId: string }): JSX.Element {
  const interviews = useLoad("interviews", api.interviews);
  return (
    <Loading loadable={interviews.current} label="Loading interview" onRetry={interviews.reload}>
      {(list) => {
        const interview = list.find((item) => item.id === interviewId);
        return interview === undefined ? (
          <Notice message={`There is no interview "${interviewId}".`} />
        ) : (
          <SetupForm api={api} interview={interview} />
        );
      }}
    </Loading>
  );
}
