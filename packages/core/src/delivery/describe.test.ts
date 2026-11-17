import type { DeliveryMetrics } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import { describeDelivery } from "./describe.js";

const delivery: DeliveryMetrics = {
  words: 90,
  wordsPerMinute: 135.5,
  fillers: [
    { word: "um", count: 3 },
    { word: "you know", count: 1 },
  ],
  fillersPerMinute: 2.7,
  repetitions: 2,
  pauseCount: 3,
  longestPauseMs: 4_250,
  latencyMs: 1_800,
  speakingShare: 0.874,
  transcriber: "whisper",
};

describe("describeDelivery", () => {
  it("lists every measurement", () => {
    expect(describeDelivery(delivery)).toBe(
      [
        "Pace: 135.5 words per minute over 90 words.",
        'Fillers: 2.7 per minute ("um" x3, "you know" x1).',
        "Immediate repetitions: 2.",
        "Pauses over one second: 3, longest 4.3s.",
        "Time to start answering: 1.8s. Share of the answer spent speaking: 87%.",
        "Transcribed verbatim: fillers and false starts are kept.",
      ].join("\n"),
    );
  });

  it("flags browser transcripts as a lower bound and handles no fillers", () => {
    const text = describeDelivery({ ...delivery, fillers: [], transcriber: "browser" });
    expect(text).toContain("Fillers: 2.7 per minute (none).");
    expect(text).toContain("counts are a lower bound");
  });
});
