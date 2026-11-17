import type { SpeechMeasurement, Transcriber, TurnTaking } from "@cyai/spec";

import { silentForMs, type VadState } from "./vad.js";

/** What the interviewer does next while the candidate has the floor. */
export type TurnSignal = "listening" | "nudge" | "end";

export interface TurnRules {
  readonly turnTaking: TurnTaking;
  readonly hardSeconds: number;
}

/**
 * Turn-taking as the real screeners do it: a conversational interviewer waits for a long
 * pause after you have spoken, and checks in if you say nothing at all; a one-way recording
 * only ends when its window closes. Every answer is cut off at the hard limit.
 */
export function turnSignal(rules: TurnRules, vad: VadState, atMs: number, nudged: boolean): TurnSignal {
  if (atMs >= rules.hardSeconds * 1000) {
    return "end";
  }
  const { turnTaking } = rules;
  if (turnTaking.endOfTurn !== "silence") {
    return "listening";
  }
  if (vad.lastSpeechMs === undefined) {
    return !nudged && atMs >= turnTaking.nudgeAfterSeconds * 1000 ? "nudge" : "listening";
  }
  return silentForMs(vad, atMs) >= turnTaking.endSilenceSeconds * 1000 ? "end" : "listening";
}

/** The microphone timing sent with an answer. Trailing silence is not part of the answer. */
export function measurement(vad: VadState, atMs: number, transcriber: Transcriber): SpeechMeasurement {
  return {
    speechMs: Math.round(vad.speechMs),
    latencyMs: Math.round(vad.firstSpeechMs ?? atMs),
    pauses: vad.pauses.map((pause) => ({ atMs: Math.round(pause.atMs), ms: Math.round(pause.ms) })),
    transcriber,
  };
}
