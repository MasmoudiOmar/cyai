import { aiTrainerInterview } from "@cyai/fixtures";
import { describe, expect, it } from "vitest";

import { followUpQuestionId, generatedQuestionId, questionSlots, slotFor } from "./question-plan.js";

describe("question plan", () => {
  it("expands fixed and generated entries into ordered slots", () => {
    expect(questionSlots(aiTrainerInterview).map((slot) => slot.kind)).toEqual(["fixed", "generated", "generated"]);
  });

  it("returns the slot for a 1-based question number, or nothing past the bank", () => {
    expect(slotFor(aiTrainerInterview, 2)).toEqual({ kind: "generated", source: "resume" });
    expect(slotFor(aiTrainerInterview, 4)).toBeUndefined();
  });

  it("builds kebab-case ids for generated and follow-up questions", () => {
    expect(generatedQuestionId(2)).toBe("gen-2");
    expect(followUpQuestionId(0, 1)).toBe("fu-0-1");
  });
});
