import { at, genericProfile } from "@cyai/fixtures";
import { describe, expect, it } from "vitest";

import { classifyOvertime, elapsedMs } from "./time.js";

describe("time", () => {
  it("measures elapsed milliseconds, negative when going backwards", () => {
    expect(elapsedMs(at(0), at(2))).toBe(2000);
    expect(elapsedMs(at(2), at(0))).toBe(-2000);
  });

  it.each([
    [120_000, "none"],
    [120_001, "soft"],
    [180_001, "hard"],
  ] as const)("classifies %i ms as %s overtime", (duration, expected) => {
    expect(classifyOvertime(duration, genericProfile.timing.answer)).toBe(expected);
  });
});
