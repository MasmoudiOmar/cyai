import type { InterviewSummary } from "@cyai/spec";
import { useState, type JSX } from "react";

import type { ApiClient } from "../api.js";
import { DropField } from "../components/DropField.js";
import { Arrow, Icon, type IconName } from "../components/Icon.js";
import { Loading } from "../components/Loading.js";
import { Notice, Skeleton } from "../components/Notice.js";
import { SystemCheck } from "../components/SystemCheck.js";
import { formatOf, formatSeconds } from "../format.js";
import { hrefFor, navigate } from "../route.js";
import { useLoad } from "../use-load.js";
import type { VoiceIO } from "../voice/io.js";

function spoken(interview: InterviewSummary): boolean {
  return interview.turnTaking.answer === "spoken";
}

/** How a turn ends, in the candidate's words. */
function turnRule(interview: InterviewSummary): string {
  const { turnTaking } = interview;
  switch (turnTaking.endOfTurn) {
    case "silence":
      return `The interviewer asks out loud and moves on when you pause for ${String(turnTaking.endSilenceSeconds)} seconds. Stay silent too long and it checks in.`;
    case "timer":
      return "The question is read out, then your answer is recorded until the window closes or you click Done.";
    case "submit":
      return "Type your answers and submit each one.";
  }
}

function timing(interview: InterviewSummary): string {
  const answer = `aim for ${formatSeconds(interview.softSeconds)} per answer, cut off at ${formatSeconds(interview.hardSeconds)}`;
  return interview.prepSeconds > 0 ? `${String(interview.prepSeconds)}s to prepare, then ${answer}` : `No prep time: ${answer}`;
}

function Brief({ interview }: { readonly interview: InterviewSummary }): JSX.Element {
  const format = formatOf(interview);
  const expectations: readonly [IconName, string, string][] = [
    ["clock", `${String(interview.totalMinutes)} minutes`, "The length of the real screen."],
    ["questions", `Up to ${String(interview.maxQuestions)} questions`, "Vague answers get follow-ups, as they would live."],
    ["hourglass", "Timed answers", timing(interview)],
    spoken(interview)
      ? ["speaker", "Spoken answers", `${turnRule(interview)} Pace, fillers and pauses are scored.`]
      : ["chat", "Typed answers", turnRule(interview)],
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

interface SetupProps {
  readonly api: ApiClient;
  /** Audio for spoken interviews; undefined until the server has said what it offers. */
  readonly voice: VoiceIO | undefined;
}

function AudioCheck({ voice, onReady }: { readonly voice: VoiceIO | undefined; readonly onReady: () => void }): JSX.Element {
  return (
    <>
      <h2 className="display">Check your audio</h2>
      <p className="muted">This interview is spoken, like the real one. Test your microphone before you start.</p>
      {voice === undefined ? <Skeleton label="Connecting your audio" count={1} /> : <SystemCheck voice={voice} onReady={onReady} />}
    </>
  );
}

function SetupForm({ api, voice, interview }: SetupProps & { readonly interview: InterviewSummary }): JSX.Element {
  const [audioReady, setAudioReady] = useState(!spoken(interview));
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
          {spoken(interview) ? (
            <AudioCheck
              voice={voice}
              onReady={() => {
                setAudioReady(true);
              }}
            />
          ) : null}
          {error === undefined ? null : <Notice message={error} />}
          <button type="button" className="button primary large block" disabled={busy || !audioReady} onClick={start}>
            {busy ? "Preparing your interview…" : audioReady ? "Start interview" : "Test your microphone to start"} <Arrow />
          </button>
        </section>
      </div>
    </>
  );
}

export function SetupPage({ api, voice, interviewId }: SetupProps & { readonly interviewId: string }): JSX.Element {
  const interviews = useLoad("interviews", api.interviews);
  return (
    <Loading loadable={interviews.current} label="Loading interview" onRetry={interviews.reload}>
      {(list) => {
        const interview = list.find((item) => item.id === interviewId);
        return interview === undefined ? (
          <Notice message={`There is no interview "${interviewId}".`} />
        ) : (
          <SetupForm api={api} voice={voice} interview={interview} />
        );
      }}
    </Loading>
  );
}
