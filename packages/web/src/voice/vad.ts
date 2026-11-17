import type { Pause } from "@cyai/spec";

/** How often the microphone level is sampled. */
export const FRAME_MS = 50;

/** Silences shorter than this are part of normal speech, not pauses. */
export const PAUSE_MIN_MS = 1_000;

/** Quietest level that can start speech, and the quietest that keeps it going. */
const START_LEVEL = 0.02;
const KEEP_LEVEL = 0.012;
const FLOOR_MIN = 0.002;
const FLOOR_MAX = 0.05;
const FLOOR_ADAPT = 0.1;

/** What has been heard since listening began. Times are milliseconds since then. */
export interface VadState {
  /** Background noise level, learned while nobody speaks. */
  readonly floor: number;
  readonly speaking: boolean;
  readonly firstSpeechMs: number | undefined;
  readonly lastSpeechMs: number | undefined;
  readonly speechMs: number;
  /** Pauses inside the answer; `atMs` is relative to the first word. */
  readonly pauses: readonly Pause[];
}

export const SILENT: VadState = {
  floor: 0.005,
  speaking: false,
  firstSpeechMs: undefined,
  lastSpeechMs: undefined,
  speechMs: 0,
  pauses: [],
};

function adaptFloor(floor: number, level: number): number {
  return Math.min(FLOOR_MAX, Math.max(FLOOR_MIN, floor * (1 - FLOOR_ADAPT) + level * FLOOR_ADAPT));
}

/**
 * Feeds one microphone frame. Speech starts above a higher threshold than it needs to
 * continue (hysteresis), so a voice trailing off is not chopped into fragments.
 */
export function hear(state: VadState, level: number, atMs: number, frameMs = FRAME_MS): VadState {
  const threshold = state.speaking ? Math.max(KEEP_LEVEL, state.floor * 2) : Math.max(START_LEVEL, state.floor * 3);
  if (level < threshold) {
    return state.speaking ? { ...state, speaking: false } : { ...state, floor: adaptFloor(state.floor, level) };
  }
  const { firstSpeechMs, lastSpeechMs } = state;
  const gapMs = state.speaking || lastSpeechMs === undefined ? 0 : atMs - lastSpeechMs - frameMs;
  const pauses =
    firstSpeechMs !== undefined && lastSpeechMs !== undefined && gapMs >= PAUSE_MIN_MS
      ? [...state.pauses, { atMs: lastSpeechMs + frameMs - firstSpeechMs, ms: gapMs }]
      : state.pauses;
  return {
    ...state,
    speaking: true,
    firstSpeechMs: firstSpeechMs ?? atMs,
    lastSpeechMs: atMs,
    speechMs: state.speechMs + frameMs,
    pauses,
  };
}

/** How long it has been quiet since the candidate last spoke; 0 before they start. */
export function silentForMs(state: VadState, atMs: number): number {
  return state.speaking || state.lastSpeechMs === undefined ? 0 : atMs - state.lastSpeechMs;
}
