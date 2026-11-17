import type { QuestionView, SpeechMeasurement } from "@cyai/spec";
import { useEffect, useRef, useState, type JSX } from "react";

import type { ApiClient } from "../api.js";
import { formatSeconds } from "../format.js";
import { TICK_MS } from "../use-elapsed.js";
import type { VoiceIO } from "../voice/io.js";
import { useSpokenTurn, type SpokenPhase } from "../voice/use-spoken-turn.js";
import { Icon } from "./Icon.js";
import { Notice } from "./Notice.js";
import { EndButton, FollowUpPill, RoomHeader, Thinking } from "./Room.js";
import { Timer, timerState } from "./Timer.js";

const PHASE_LABELS: Readonly<Record<SpokenPhase, string>> = {
  asking: "Interviewer speaking",
  prep: "Prepare your answer",
  listening: "Listening",
  nudging: "Interviewer speaking",
  transcribing: "Transcribing your answer",
  failed: "Audio stopped",
};

/** Seconds since `start`, ticking while `running`. */
function useSecondsSince(start: number | undefined, running: boolean): number | undefined {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (start === undefined || !running) {
      return undefined;
    }
    const timer = setInterval((): void => {
      setNow(Date.now());
    }, TICK_MS);
    return (): void => {
      clearInterval(timer);
    };
  }, [start, running]);
  return start === undefined ? undefined : Math.max(0, (now - start) / 1000);
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
 * A spoken question, run the way voice screeners run it: the question is heard rather than
 * read (captions are optional and off for conversational interviews), and the answer ends on
 * a long pause or when the recording window closes.
 */
export function VoiceRoom({ view, voice, api, busy, onAnswer, onStop, onType }: VoiceRoomProps): JSX.Element {
  const meter = useRef<HTMLSpanElement | null>(null);
  const turn = useSpokenTurn(view, voice, api, onAnswer, meter);
  const [captions, setCaptions] = useState(view.turnTaking.endOfTurn !== "silence");
  const answering = turn.phase === "prep" || turn.phase === "listening" || turn.phase === "nudging";
  const elapsed = useSecondsSince(turn.clockStartedAt, answering && !busy);
  const label = busy ? "Evaluating" : PHASE_LABELS[turn.phase];

  return (
    <div className="room">
      <RoomHeader view={view} />
      <section className="card pad stage" aria-labelledby="question-text">
        <div className="prompt">
          <FollowUpPill view={view} />
          <div className={`voice-presence phase-${busy ? "thinking" : turn.phase}`}>
            <span className="orb" />
            <span className="mic-level" ref={meter} />
            <span className="presence-label" role="status">
              {label}
            </span>
          </div>
          <h1 id="question-text" className={captions ? "display" : "sr-only"}>
            {view.text}
          </h1>
          <p className="hint">{hintFor(view)}</p>
        </div>
        {elapsed === undefined ? null : <Timer limits={view} state={timerState(view, elapsed)} />}
      </section>

      <section className="card answer voice-bar">
        {turn.error === undefined ? null : (
          <Notice message={turn.error} onRetry={onType} retryLabel="Type this answer instead" />
        )}
        <div className="answer-bar">
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
          <EndButton busy={busy} onStop={onStop} />
          {view.turnTaking.endOfTurn === "silence" ? null : (
            <button type="button" className="button primary" disabled={turn.phase !== "listening" || busy} onClick={turn.finish}>
              Done <Icon name="check" size={16} />
            </button>
          )}
        </div>
        {busy ? <Thinking /> : null}
      </section>
    </div>
  );
}
