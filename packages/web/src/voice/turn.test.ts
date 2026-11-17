import type { TurnTaking } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import { measurement, turnSignal, type TurnRules } from "./turn.js";
import { SILENT, type VadState } from "./vad.js";

const conversational: TurnRules = {
  turnTaking: { answer: "spoken", endOfTurn: "silence", endSilenceSeconds: 4, nudgeAfterSeconds: 10 },
  hardSeconds: 180,
};

const spoke: VadState = { ...SILENT, firstSpeechMs: 2_000, lastSpeechMs: 20_000, speechMs: 15_000 };

describe("turnSignal", () => {
  it("waits for a long pause once the candidate has spoken", () => {
    expect(turnSignal(conversational, spoke, 23_000, false)).toBe("listening");
    expect(turnSignal(conversational, spoke, 24_000, false)).toBe("end");
    expect(turnSignal(conversational, { ...spoke, speaking: true }, 30_000, false)).toBe("listening");
  });

  it("checks in once on a silent start", () => {
    expect(turnSignal(conversational, SILENT, 9_000, false)).toBe("listening");
    expect(turnSignal(conversational, SILENT, 10_000, false)).toBe("nudge");
    expect(turnSignal(conversational, SILENT, 60_000, true)).toBe("listening");
  });

  it.each<TurnTaking>([
    { answer: "spoken", endOfTurn: "timer" },
    { answer: "typed", endOfTurn: "submit" },
  ])("never ends on silence for %j, only at the hard limit", (turnTaking) => {
    const rules = { turnTaking, hardSeconds: 120 };
    expect(turnSignal(rules, spoke, 119_000, false)).toBe("listening");
    expect(turnSignal(rules, spoke, 120_000, false)).toBe("end");
    expect(turnSignal(conversational, SILENT, 180_000, true)).toBe("end");
  });
});

describe("measurement", () => {
  it("rounds the timing and leaves out trailing silence", () => {
    const vad: VadState = { ...spoke, speechMs: 15_000.4, pauses: [{ atMs: 3_000.6, ms: 1_200.2 }] };
    expect(measurement(vad, 26_000, "whisper")).toEqual({
      speechMs: 15_000,
      latencyMs: 2_000,
      pauses: [{ atMs: 3_001, ms: 1_200 }],
      transcriber: "whisper",
    });
  });

  it("counts the whole wait as latency when nothing was said", () => {
    expect(measurement(SILENT, 7_000.2, "browser")).toMatchObject({ speechMs: 0, latencyMs: 7_000 });
  });
});
