import type { QuestionView } from "@cyai/spec";
import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from "react";

import { wordCount } from "../format.js";
import { useElapsedSeconds } from "../use-elapsed.js";
import { Arrow, Icon } from "./Icon.js";
import { Timer, timerState } from "./Timer.js";

interface QuestionCardProps {
  readonly view: QuestionView;
  readonly busy: boolean;
  readonly onSubmit: (answer: string) => void;
  readonly onStop: () => void;
}

function Steps({ number, total }: { readonly number: number; readonly total: number }): JSX.Element {
  return (
    <span className="steps" aria-hidden="true">
      {Array.from({ length: Math.max(total, number) }, (_, index) => (
        <span key={index} className={index + 1 < number ? "done" : index + 1 === number ? "current" : ""} />
      ))}
    </span>
  );
}

/** The interview room for one question: the prompt, the interviewer's clock and the answer box. */
export function QuestionCard({ view, busy, onSubmit, onStop }: QuestionCardProps): JSX.Element {
  const [answer, setAnswer] = useState("");
  // The clock stops at the first submission: evaluation time is not answer time.
  const [frozenAt, setFrozenAt] = useState<number | undefined>();
  const elapsed = useElapsedSeconds();
  const state = timerState(view, frozenAt ?? elapsed);
  const timeUp = state.phase === "over";
  const answered = useRef(false);

  const send = useCallback(
    (text: string) => {
      answered.current = true;
      setFrozenAt((current) => current ?? elapsed);
      onSubmit(text);
    },
    [elapsed, onSubmit],
  );

  // Like a real AI interviewer, the answer is taken as it stands when time runs out.
  useEffect(() => {
    if (timeUp && !answered.current) {
      send(answer);
    }
  }, [timeUp, answer, send]);

  const canSubmit = !busy && (answer.trim().length > 0 || timeUp);
  const submit = (): void => {
    if (canSubmit) {
      send(answer);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };
  const words = wordCount(answer);

  return (
    <div className="room">
      <header className="room-head">
        <p className="eyebrow">
          {view.role} · Question {view.number} of up to {view.maxQuestions}
        </p>
        <Steps number={view.number} total={view.maxQuestions} />
      </header>

      <section className="card pad stage" aria-labelledby="question-text">
        <div className="prompt">
          {view.followUp ? (
            <span className="pill accent">
              <Icon name="spark" size={14} /> Follow-up
            </span>
          ) : null}
          <h1 id="question-text" className="display">
            {view.text}
          </h1>
          <p className="hint">Answer as you would out loud. Situation, action, result works well.</p>
        </div>
        <Timer limits={view} state={state} />
      </section>

      <section className="card answer">
        <label htmlFor="answer" className="sr-only">
          Your answer
        </label>
        <textarea
          id="answer"
          value={answer}
          rows={7}
          disabled={busy}
          placeholder="Start typing your answer…"
          onChange={(event) => {
            setAnswer(event.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="answer-bar">
          <span className="hint">
            {words} {words === 1 ? "word" : "words"} · <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> to
            submit
          </span>
          <button type="button" className="button ghost" disabled={busy} onClick={onStop}>
            <Icon name="stop" size={16} /> End interview
          </button>
          <button type="button" className="button primary" disabled={!canSubmit} onClick={submit}>
            {busy ? "Evaluating…" : "Submit answer"} <Arrow />
          </button>
        </div>
        {busy ? (
          <div className="thinking" role="status">
            <span className="orb" />
            <p>
              <strong>Your interviewer is evaluating your answer</strong>
              <br />
              <span className="muted">The next question follows in a moment.</span>
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
