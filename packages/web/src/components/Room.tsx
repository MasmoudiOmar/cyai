import type { QuestionView } from "@cyai/spec";
import type { JSX } from "react";

import { Icon } from "./Icon.js";

function Steps({ number, total }: { readonly number: number; readonly total: number }): JSX.Element {
  return (
    <span className="steps" aria-hidden="true">
      {Array.from({ length: Math.max(total, number) }, (_, index) => (
        <span key={index} className={index + 1 < number ? "done" : index + 1 === number ? "current" : ""} />
      ))}
    </span>
  );
}

/** Where the candidate is in the interview. */
export function RoomHeader({ view }: { readonly view: QuestionView }): JSX.Element {
  return (
    <header className="room-head">
      <p className="eyebrow">
        {view.role} · Question {view.number} of up to {view.maxQuestions}
      </p>
      <Steps number={view.number} total={view.maxQuestions} />
    </header>
  );
}

export function FollowUpPill({ view }: { readonly view: QuestionView }): JSX.Element | null {
  return view.followUp ? (
    <span className="pill accent">
      <Icon name="spark" size={14} /> Follow-up
    </span>
  ) : null;
}

/** Covers the answer area while the interviewer evaluates. */
export function Thinking(): JSX.Element {
  return (
    <div className="thinking" role="status">
      <span className="orb" />
      <p>
        <strong>Your interviewer is evaluating your answer</strong>
        <br />
        <span className="muted">The next question follows in a moment.</span>
      </p>
    </div>
  );
}

export function EndButton({ busy, onStop }: { readonly busy: boolean; readonly onStop: () => void }): JSX.Element {
  return (
    <button type="button" className="button ghost" disabled={busy} onClick={onStop}>
      <Icon name="stop" size={16} /> End interview
    </button>
  );
}
