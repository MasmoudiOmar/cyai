import { describe, expect, it } from "vitest";

import {
  FORMATS,
  formatDate,
  formatOf,
  formatScore,
  formatSeconds,
  humanize,
  isOpen,
  scoreTone,
  statusLabel,
  wordCount,
} from "./format.js";
import { interview, spokenInterview } from "./test-support/views.js";

describe("format", () => {
  it("formats scores, durations, dates, statuses and word counts", () => {
    expect(formatScore(3.456)).toBe("3.5");
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(65.2)).toBe("1:06");
    expect(formatSeconds(-3)).toBe("0:00");
    expect(formatDate("2026-01-01T09:00:00.000Z")).toMatch(/2026/);
    expect(statusLabel("awaiting_answer")).toBe("In progress");
    expect(statusLabel("abandoned")).toBe("Stopped");
    expect(wordCount("  ")).toBe(0);
    expect(wordCount(" one two\nthree ")).toBe(3);
  });

  it("classifies sessions, scores, formats and ids", () => {
    expect(isOpen("awaiting_evaluation")).toBe(true);
    expect(isOpen("completed")).toBe(false);
    expect([scoreTone(4), scoreTone(3.9), scoreTone(3), scoreTone(2.9)]).toEqual(["high", "mid", "mid", "low"]);
    expect(FORMATS.async.icon).toBe("video");
    expect(humanize("graduate-program-behavioral")).toBe("Graduate program behavioral");
  });
});

describe("formatOf", () => {
  it("shows a microphone only for live interviews answered out loud", () => {
    expect(formatOf(interview).icon).toBe("chat");
    expect(formatOf(spokenInterview).icon).toBe("live");
    expect(formatOf({ ...interview, format: "async" })).toEqual({ label: "Async video screen", icon: "video" });
  });
});
