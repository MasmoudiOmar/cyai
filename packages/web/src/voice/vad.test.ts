import { describe, expect, it } from "vitest";

import { FRAME_MS, hear, SILENT, silentForMs, type VadState } from "./vad.js";

/** Feeds `level` for `ms`, starting at `fromMs`. */
function feed(state: VadState, level: number, fromMs: number, ms: number): VadState {
  let current = state;
  for (let at = fromMs; at < fromMs + ms; at += FRAME_MS) {
    current = hear(current, level, at);
  }
  return current;
}

describe("voice activity", () => {
  it("learns the noise floor and ignores it", () => {
    const quiet = feed(SILENT, 0.004, 0, 2_000);
    expect(quiet.speaking).toBe(false);
    expect(quiet.floor).toBeLessThan(SILENT.floor);
    expect(feed(SILENT, 1, 0, 0)).toBe(SILENT);
  });

  it("times speech, pauses and the start of the answer", () => {
    let state = feed(SILENT, 0.003, 0, 1_500);
    state = feed(state, 0.1, 1_500, 2_000);
    expect(state).toMatchObject({ speaking: true, firstSpeechMs: 1_500, speechMs: 2_000 });
    state = feed(state, 0.003, 3_500, 400);
    expect(state.speaking).toBe(false);
    expect(silentForMs(state, 3_900)).toBe(450);
    // Too faint to restart speech, so the pause carries on.
    state = feed(state, 0.015, 3_900, 100);
    expect(state.pauses).toEqual([]);
    state = feed(state, 0.003, 4_000, 2_000);
    state = feed(state, 0.1, 6_000, 500);
    expect(state.pauses).toEqual([{ atMs: 2_000, ms: 2_500 }]);
    expect(state.speechMs).toBe(2_500);
  });

  it("keeps speech going at a lower level than it needs to start", () => {
    const talking = feed(SILENT, 0.1, 0, 200);
    expect(hear(talking, 0.015, 200).speaking).toBe(true);
    expect(hear(SILENT, 0.015, 0).speaking).toBe(false);
  });

  it("is never silent before the candidate speaks", () => {
    expect(silentForMs(SILENT, 9_000)).toBe(0);
    expect(silentForMs(feed(SILENT, 0.1, 0, 100), 100)).toBe(0);
  });
});
