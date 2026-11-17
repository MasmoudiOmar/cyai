import type { JSX } from "react";

import { formatSeconds } from "../format.js";
import { Ring } from "./ScoreRing.js";

export type TimerPhase = "prep" | "answer" | "overtime" | "over";

export interface TimerState {
  readonly phase: TimerPhase;
  /** Seconds spent answering, after any preparation time. */
  readonly answering: number;
  readonly prepLeft: number;
  readonly hardLeft: number;
}

export interface Limits {
  readonly prepSeconds: number;
  readonly softSeconds: number;
  readonly hardSeconds: number;
}

export function timerState(limits: Limits, elapsed: number): TimerState {
  const prepLeft = limits.prepSeconds - elapsed;
  const answering = Math.max(0, elapsed - limits.prepSeconds);
  const hardLeft = limits.hardSeconds - answering;
  const phase: TimerPhase =
    prepLeft > 0 ? "prep" : hardLeft <= 0 ? "over" : answering >= limits.softSeconds ? "overtime" : "answer";
  return { phase, answering, prepLeft, hardLeft };
}

interface Face {
  readonly digits: string;
  readonly label: string;
  readonly caption: string;
  readonly progress: number;
}

function face(limits: Limits, state: TimerState): Face {
  switch (state.phase) {
    case "prep":
      return {
        digits: formatSeconds(state.prepLeft),
        label: "Prepare",
        caption: "Gather your thoughts. The answer clock starts next.",
        progress: 1 - state.prepLeft / limits.prepSeconds,
      };
    case "answer":
      return {
        digits: formatSeconds(state.answering),
        label: `of ${formatSeconds(limits.softSeconds)}`,
        caption: `Aim for ${formatSeconds(limits.softSeconds)}. Cut-off at ${formatSeconds(limits.hardSeconds)}.`,
        progress: state.answering / limits.hardSeconds,
      };
    case "overtime":
      return {
        digits: formatSeconds(state.hardLeft),
        label: "left",
        caption: "Over the suggested time: wrap up.",
        progress: state.answering / limits.hardSeconds,
      };
    case "over":
      return { digits: "0:00", label: "time", caption: "Time is up", progress: 1 };
  }
}

/** A ring that follows the interviewer's clock: preparation, the suggested time, then the hard cut-off. */
export function Timer({ limits, state }: { readonly limits: Limits; readonly state: TimerState }): JSX.Element {
  const { digits, label, caption, progress } = face(limits, state);
  return (
    <div className={`timer timer-${state.phase}`}>
      <Ring progress={progress} size={150} stroke={8} gradient={state.phase === "answer"}>
        <strong role="timer" aria-live="off">
          {digits}
        </strong>
        <small>{label}</small>
      </Ring>
      <p className="timer-caption">{caption}</p>
    </div>
  );
}
