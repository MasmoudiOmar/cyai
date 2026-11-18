import type { QuestionView, SpeechMeasurement } from "@cyai/spec";
import { useRef, useState, type JSX } from "react";

import type { ApiClient } from "../api.js";
import { formatSeconds } from "../format.js";
import { useNow } from "../use-elapsed.js";
import type { VoiceIO } from "../voice/io.js";
import { useSpokenTurn, type SpokenPhase } from "../voice/use-spoken-turn.js";
import { Icon } from "./Icon.js";
import { Notice } from "./Notice.js";
import { EndButton, FollowUpPill, Thinking } from "./Room.js";
import { Timer, timerState } from "./Timer.js";

const PHASE_LABELS: Readonly<Record<SpokenPhase, string>> = {
  asking: "Interviewer speaking",
  prep: "Prepare your answer",
  listening: "Listening",
  nudging: "Interviewer speaking",
  transcribing: "Transcribing your answer",
  failed: "Audio stopped",
};

/** Seconds since `start`, frozen while not `running`. */
function useSecondsSince(start: number | undefined, running: boolean): number {
  const now = useNow(start !== undefined && running);
  return start === undefined ? 0 : Math.max(0, (now - start) / 1000);
}

function hintFor(view: QuestionView): string {
  const { turnTaking } = view;
  switch (turnTaking.endOfTurn) {
    case "silence":
      return `Answer out loud. When you stop talking for ${String(turnTaking.endSilenceSeconds)} seconds, the interviewer moves on.`;
    case "timer":
    case "submit":
      return `Answer out loud. Recording stops at ${formatSeconds(view.hardSeconds)}, or when you click Done.`;
  }
}

/** Time left in the whole interview, from the budget the server set. */
function InterviewClock({ endsAt }: { readonly endsAt: string }): JSX.Element {
  const now = useNow();
  return (
    <span className="call-total">
      <Icon name="clock" size={15} />
      {formatSeconds((Date.parse(endsAt) - now) / 1000)} left in interview
    </span>
  );
}

interface VoiceRoomProps {
  readonly view: QuestionView;
  readonly voice: VoiceIO;
  readonly api: Pick<ApiClient, "transcribe">;
  readonly busy: boolean;
  readonly onAnswer: (text: string, speech: SpeechMeasurement) => void;
  readonly onStop: () => void;
  /** Switches this question to a typed answer, when audio fails. */
  readonly onType: () => void;
}

/**
 * A spoken question, laid out as the video call voice screeners run: the interviewer's tile,
 * yours beside it with the answer clock, captions off by default for conversational
 * interviews, and the answer ending on a long pause or when the recording window closes.
 */
export function VoiceRoom({ view, voice, api, busy, onAnswer, onStop, onType }: VoiceRoomProps): JSX.Element {
  const meter = useRef<HTMLSpanElement | null>(null);
  const turn = useSpokenTurn(view, voice, api, onAnswer, meter);
  const [captions, setCaptions] = useState(view.turnTaking.endOfTurn !== "silence");
  const answering = turn.phase === "prep" || turn.phase === "listening" || turn.phase === "nudging";
  const elapsed = useSecondsSince(turn.clockStartedAt, answering && !busy);
  const phase = busy ? "thinking" : turn.phase;
  const interviewerSpeaking = phase === "asking" || phase === "nudging";
  const recording = phase === "listening" || phase === "nudging";

  return (
    <div className={`call phase-${phase}`}>
      <header className="call-top">
        <span className="call-title">
          <span className="eyebrow">
            {view.role} · Question {view.number} of up to {view.maxQuestions}
          </span>
          <FollowUpPill view={view} />
        </span>
        <span className="call-top-right">
          <InterviewClock endsAt={view.endsAt} />
          {recording ? (
            <span className="call-rec">
              <span className="call-rec-dot" /> Recording
            </span>
          ) : null}
        </span>
      </header>

      <div className="call-grid">
        <section className={`call-tile call-interviewer${interviewerSpeaking ? " speaking" : ""}`} aria-label="Interviewer">
          <span className="orb call-avatar" />
          <span className="call-name">
            AI interviewer
            <span className="call-state" role="status">
              {busy ? "Evaluating" : PHASE_LABELS[turn.phase]}
            </span>
          </span>
        </section>
        <div className="call-side">
          <section className={`call-tile call-you${recording ? " speaking" : ""}`} aria-label="You">
            <span className="call-mic">
              <span className="mic-level" ref={meter} />
              <Icon name="live" size={30} />
            </span>
            <span className="call-name">You</span>
          </section>
          <section className="call-timer" aria-label="Answer time">
            <Timer limits={view} state={timerState(view, elapsed)} />
          </section>
        </div>
        {busy ? <Thinking /> : null}
      </div>

      <h1 id="question-text" className={captions ? "display call-captions" : "sr-only"}>
        {view.text}
      </h1>
      <p className="call-hint">{hintFor(view)}</p>
      {turn.error === undefined ? null : <Notice message={turn.error} onRetry={onType} retryLabel="Type this answer instead" />}

      <footer className="call-controls">
        <button
          type="button"
          className="button ghost"
          aria-pressed={captions}
          onClick={() => {
            setCaptions((shown) => !shown);
          }}
        >
          <Icon name="captions" size={16} /> {captions ? "Hide captions" : "Show captions"}
        </button>
        {view.turnTaking.endOfTurn === "silence" ? null : (
          <button type="button" className="button primary" disabled={turn.phase !== "listening" || busy} onClick={turn.finish}>
            Done <Icon name="check" size={16} />
          </button>
        )}
        <EndButton busy={busy} onStop={onStop} />
      </footer>
    </div>
  );
}
