import { describe, expect, it } from "vitest";

import { formatDate, formatScore, formatSeconds, statusLabel, wordCount } from "./format.js";

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
});
