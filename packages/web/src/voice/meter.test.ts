// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { showLevel } from "./meter.js";

describe("showLevel", () => {
  it("grows the ring with the level, capped at full voice", () => {
    const ring = document.createElement("span");
    showLevel({ current: ring }, 0.05);
    expect(ring.style.transform).toBe("scale(1.24)");
    showLevel({ current: ring }, 1);
    expect(ring.style.transform).toBe("scale(1.6)");
  });

  it("does nothing before the ring is mounted", () => {
    expect(() => {
      showLevel({ current: null }, 0.5);
    }).not.toThrow();
  });
});
