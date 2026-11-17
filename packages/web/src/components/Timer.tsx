import type { JSX } from "react";

import { formatSeconds } from "../format.js";

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

function caption(limits: Limits, state: TimerState): string {
  switch (state.phase) {
    case "prep":
      return `Preparation: ${formatSeconds(state.prepLeft)} left`;
    case "answer":
      return `${formatSeconds(state.answering)} of ${formatSeconds(limits.softSeconds)} suggested`;
    case "overtime":
      return `Over the suggested time: ${formatSeconds(state.hardLeft)} until the cut-off`;
    case "over":
      return "Time is up";
  }
}

export function Timer({ limits, state }: { readonly limits: Limits; readonly state: TimerState }): JSX.Element {
  const progress = Math.min(1, state.answering / limits.hardSeconds);
  return (
    <div className={`timer timer-${state.phase}`}>
      <span role="timer" aria-live="off">
        {caption(limits, state)}
      </span>
      <span className="timer-track" aria-hidden="true">
        <span className="timer-fill" style={{ width: `${String(progress * 100)}%` }} />
        <span className="timer-soft" style={{ left: `${String((limits.softSeconds / limits.hardSeconds) * 100)}%` }} />
      </span>
    </div>
  );
}
