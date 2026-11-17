import type { InterviewSummary } from "@cyai/spec";
import { useState, type ChangeEvent, type JSX } from "react";

import type { ApiClient } from "../api.js";
import { Loading } from "../components/Loading.js";
import { Notice } from "../components/Notice.js";
import { hrefFor, navigate } from "../route.js";
import { useLoad } from "../use-load.js";

interface ContextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** A pasteable text area that can also be filled from a .txt or .md file. */
function ContextField({ id, label, hint, value, onChange }: ContextFieldProps): JSX.Element {
  const onFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file !== undefined) {
      void file.text().then(onChange);
    }
  };
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label} <span className="muted">(optional)</span>
      </label>
      <textarea
        id={id}
        rows={6}
        value={value}
        placeholder={hint}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <label className="file">
        <span className="muted">or load a text file</span>
        <input type="file" accept=".txt,.md,text/plain,text/markdown" aria-label={`${label} file`} onChange={onFile} />
      </label>
    </div>
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
    <section className="card setup">
      <p className="eyebrow">{interview.profile}</p>
      <h1>{interview.role}</h1>
      <p className="facts">
        {interview.totalMinutes} min · up to {interview.maxQuestions} questions · timed answers
      </p>
      <p className="muted">
        Sharing your resume and the job description lets the interviewer ask about your experience. They stay on this computer,
        apart from what is sent to the interviewer model.
      </p>
      <ContextField id="resume" label="Resume" hint="Paste your resume…" value={resume} onChange={setResume} />
      <ContextField
        id="job-description"
        label="Job description"
        hint="Paste the job posting…"
        value={jobDescription}
        onChange={setJobDescription}
      />
      {error === undefined ? null : <Notice message={error} />}
      <div className="actions">
        <a className="button secondary" href={hrefFor({ page: "home" })}>
          Back
        </a>
        <span className="spacer" />
        <button type="button" className="button primary" disabled={busy} onClick={start}>
          {busy ? "Preparing your interview…" : "Start interview"}
        </button>
      </div>
    </section>
  );
}

export function SetupPage({ api, interviewId }: { readonly api: ApiClient; readonly interviewId: string }): JSX.Element {
  const interviews = useLoad("interviews", api.interviews);
  return (
    <Loading loadable={interviews.current} label="Loading interview…" onRetry={interviews.reload}>
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
