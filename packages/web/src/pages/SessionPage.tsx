import type { PracticeView, SpeechMeasurement } from "@cyai/spec";
import { useCallback, useState, type JSX } from "react";

import type { ApiClient, ApiResult } from "../api.js";
import { Debrief } from "../components/Debrief.js";
import { Arrow, Icon } from "../components/Icon.js";
import { Loading } from "../components/Loading.js";
import { Notice, Skeleton } from "../components/Notice.js";
import { QuestionCard } from "../components/QuestionCard.js";
import { VoiceRoom } from "../components/VoiceRoom.js";
import { hrefFor } from "../route.js";
import { useLoad } from "../use-load.js";
import type { VoiceIO } from "../voice/io.js";

function Ended({ view }: { readonly view: Extract<PracticeView, { kind: "abandoned" }> }): JSX.Element {
  return (
    <section className="ended">
      <span className="icon-tile">
        <Icon name="stop" size={22} />
      </span>
      <p className="eyebrow">{view.role}</p>
      <h1 className="display">This interview was stopped</h1>
      <p className="muted">{view.reason} Nothing was scored. Start a fresh one whenever you are ready.</p>
      <div className="hero-actions">
        <a className="button primary" href={hrefFor({ page: "setup", interviewId: view.interviewId })}>
          Start again <Arrow />
        </a>
        <a className="button ghost" href={hrefFor({ page: "home" })}>
          All interviews
        </a>
      </div>
    </section>
  );
}

interface SessionProps {
  readonly api: ApiClient;
  /** Audio for spoken interviews; undefined until the server has said what it offers. */
  readonly voice: VoiceIO | undefined;
}

/** A running session: the current view, replaced by each answer the candidate submits. */
function SessionView({ api, voice, initial }: SessionProps & { readonly initial: PracticeView }): JSX.Element {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // The question the candidate chose to type after the audio failed.
  const [typedQuestion, setTypedQuestion] = useState<number | undefined>();

  const run = useCallback((step: () => ApiResult<PracticeView>): void => {
    setBusy(true);
    setError(undefined);
    void step().then((result) => {
      setBusy(false);
      if (result.ok) {
        setView(result.value);
      } else {
        setError(result.error);
      }
    });
  }, []);

  const onSubmit = useCallback(
    (answer: string, speech?: SpeechMeasurement) => {
      run(() => api.answer(view.sessionId, answer, speech));
    },
    [api, run, view.sessionId],
  );
  const onStop = useCallback(() => {
    run(() => api.abandon(view.sessionId));
  }, [api, run, view.sessionId]);

  return (
    <>
      {error === undefined ? null : <Notice message={error} />}
      {view.kind === "question" ? (
        view.turnTaking.answer === "typed" || typedQuestion === view.number ? (
          <QuestionCard key={view.number} view={view} busy={busy} onSubmit={onSubmit} onStop={onStop} />
        ) : voice === undefined ? (
          <Skeleton label="Connecting your audio" count={1} />
        ) : (
          <VoiceRoom
            key={view.number}
            view={view}
            voice={voice}
            api={api}
            busy={busy}
            onAnswer={onSubmit}
            onStop={onStop}
            onType={() => {
              setTypedQuestion(view.number);
            }}
          />
        )
      ) : null}
      {view.kind === "completed" ? <Debrief view={view} /> : null}
      {view.kind === "abandoned" ? <Ended view={view} /> : null}
    </>
  );
}

export function SessionPage({ api, voice, sessionId }: SessionProps & { readonly sessionId: string }): JSX.Element {
  const session = useLoad(sessionId, () => api.session(sessionId));
  return (
    <Loading loadable={session.current} label="Loading your interview" onRetry={session.reload}>
      {(view) => <SessionView key={sessionId} api={api} voice={voice} initial={view} />}
    </Loading>
  );
}
