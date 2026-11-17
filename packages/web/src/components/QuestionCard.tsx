import type { QuestionView } from "@cyai/spec";
import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from "react";

import { wordCount } from "../format.js";
import { useElapsedSeconds } from "../use-elapsed.js";
import { Timer, timerState } from "./Timer.js";

interface QuestionCardProps {
  readonly view: QuestionView;
  readonly busy: boolean;
  readonly onSubmit: (answer: string) => void;
  readonly onStop: () => void;
}

/** One question: the prompt, a timer that follows the interviewer's limits, and the answer box. */
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

  return (
    <section className="card question" aria-labelledby="question-text">
      <p className="eyebrow">
        Question {view.number} of up to {view.maxQuestions}
        {view.followUp ? <span className="badge">Follow-up</span> : null}
      </p>
      <h2 id="question-text" className="question-text">
        {view.text}
      </h2>
      <Timer limits={view} state={state} />
      <label htmlFor="answer" className="label">
        Your answer
      </label>
      <textarea
        id="answer"
        className="answer"
        value={answer}
        rows={9}
        disabled={busy}
        placeholder="Answer as you would out loud. Structure helps: situation, action, result."
        onChange={(event) => {
          setAnswer(event.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <div className="actions">
        <span className="muted">{wordCount(answer)} words · Ctrl+Enter to submit</span>
        <span className="spacer" />
        <button type="button" className="button secondary" disabled={busy} onClick={onStop}>
          End interview
        </button>
        <button type="button" className="button primary" disabled={!canSubmit} onClick={submit}>
          {busy ? "Evaluating…" : "Submit answer"}
        </button>
      </div>
    </section>
  );
}
