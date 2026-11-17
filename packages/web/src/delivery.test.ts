import type { DeliveryMetrics, EvaluatedTurn } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import { fillerSegments, rateFillers, rateLatency, ratePace, ratePause, summarizeDelivery } from "./delivery.js";
import { completed } from "./test-support/views.js";

const base: DeliveryMetrics = {
  words: 140,
  wordsPerMinute: 140,
  fillers: [{ word: "um", count: 2 }],
  fillersPerMinute: 2,
  repetitions: 0,
  pauseCount: 1,
  longestPauseMs: 2_000,
  latencyMs: 1_000,
  durationMs: 62_000,
  speakingShare: 0.97,
  transcriber: "whisper",
};

function spoken(delivery: DeliveryMetrics | undefined): EvaluatedTurn {
  const [turn] = completed.turns;
  if (turn === undefined) {
    throw new Error("The fixture has a turn");
  }
  return { ...turn, answer: delivery === undefined ? { text: "Typed.", answeredAt: turn.answer.answeredAt } : { ...turn.answer, delivery } };
}

describe("summarizeDelivery", () => {
  it("is absent for typed interviews", () => {
    expect(summarizeDelivery([spoken(undefined)])).toBeUndefined();
  });

  it("weights pace and fillers by speaking time across answers", () => {
    const second: DeliveryMetrics = {
      ...base,
      words: 60,
      wordsPerMinute: 120,
      fillers: [
        { word: "uh", count: 4 },
        { word: "um", count: 1 },
      ],
      longestPauseMs: 4_500,
      latencyMs: 3_000,
      transcriber: "browser",
    };
    expect(summarizeDelivery([spoken(base), spoken(second), spoken(undefined)])).toEqual({
      answers: 2,
      wordsPerMinute: 133,
      fillersPerMinute: 4.7,
      fillers: [
        { word: "uh", count: 4 },
        { word: "um", count: 3 },
      ],
      longestPauseMs: 4_500,
      averageLatencyMs: 2_000,
      transcriber: "browser",
    });
  });

  it("reports zero pace for answers with no words", () => {
    expect(summarizeDelivery([spoken({ ...base, words: 0, wordsPerMinute: 0, fillers: [] })])).toMatchObject({
      wordsPerMinute: 0,
      fillersPerMinute: 0,
      transcriber: "whisper",
    });
  });
});

describe("ratings", () => {
  it.each([
    [ratePace(100), "mid"],
    [ratePace(140), "high"],
    [ratePace(185), "mid"],
    [rateFillers(1), "high"],
    [rateFillers(5), "mid"],
    [rateFillers(12), "low"],
    [ratePause(1_000), "high"],
    [ratePause(4_000), "mid"],
    [ratePause(7_000), "low"],
    [rateLatency(500), "high"],
    [rateLatency(3_000), "mid"],
    [rateLatency(9_000), "low"],
  ] as const)("rates %j as %s", (rated, band) => {
    expect(rated.band).toBe(band);
  });
});

describe("fillerSegments", () => {
  it("marks fillers and filler phrases in the original text", () => {
    expect(fillerSegments("Ummm, you know, I fixed it. Uh")).toEqual([
      { text: "Ummm", filler: true },
      { text: ", ", filler: false },
      { text: "you know", filler: true },
      { text: ", I fixed it. ", filler: false },
      { text: "Uh", filler: true },
    ]);
    expect(fillerSegments("Clean answer.")).toEqual([{ text: "Clean answer.", filler: false }]);
    expect(fillerSegments("")).toEqual([]);
  });
});
