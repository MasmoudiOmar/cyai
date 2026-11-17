import type { SpeechMeasurement } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import { analyzeDelivery } from "./analyze.js";

const minute: SpeechMeasurement = { speechMs: 60_000, latencyMs: 1_200, pauses: [], transcriber: "whisper" };

describe("analyzeDelivery", () => {
  it("counts hesitation sounds however they are spelled", () => {
    const metrics = analyzeDelivery("Ummm, so uh I think, uhh, erm, the ah hmm mm cause was", minute);
    expect(metrics.fillers).toEqual([
      { word: "uh", count: 2 },
      { word: "um", count: 1 },
      { word: "er", count: 1 },
      { word: "ah", count: 1 },
      { word: "hmm", count: 1 },
      { word: "mm", count: 1 },
    ]);
    expect(metrics.fillersPerMinute).toBe(7);
  });

  it("counts padding phrases but not the same words used plainly", () => {
    const metrics = analyzeDelivery("Know what? You know, I mean it worked. I know what I meant.", minute);
    expect(metrics.fillers).toEqual([
      { word: "you know", count: 1 },
      { word: "i mean", count: 1 },
    ]);
  });

  it("counts immediate repetitions and measures pace over speaking time only", () => {
    const metrics = analyzeDelivery("I I think the the fix was simple", {
      ...minute,
      speechMs: 30_000,
      pauses: [
        { atMs: 2_000, ms: 1_500 },
        { atMs: 9_000, ms: 3_500 },
      ],
    });
    expect(metrics).toMatchObject({
      words: 8,
      wordsPerMinute: 16,
      repetitions: 2,
      pauseCount: 2,
      longestPauseMs: 3_500,
      latencyMs: 1_200,
      speakingShare: 0.86,
      transcriber: "whisper",
    });
  });

  it("reports zeros for silence", () => {
    expect(analyzeDelivery("", { speechMs: 0, latencyMs: 0, pauses: [], transcriber: "browser" })).toEqual({
      words: 0,
      wordsPerMinute: 0,
      fillers: [],
      fillersPerMinute: 0,
      repetitions: 0,
      pauseCount: 0,
      longestPauseMs: 0,
      latencyMs: 0,
      speakingShare: 0,
      transcriber: "browser",
    });
  });
});
