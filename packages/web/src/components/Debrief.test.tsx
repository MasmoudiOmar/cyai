// @vitest-environment jsdom
import { evaluation } from "@cyai/fixtures";
import type { CompletedView } from "@cyai/spec";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "../test-support/dom.js";
import { completed } from "../test-support/views.js";
import { Debrief } from "./Debrief.js";

const [first] = completed.turns;

function withTurns(...overrides: Partial<NonNullable<typeof first>>[]): CompletedView {
  if (first === undefined) {
    throw new Error("fixture has no turn");
  }
  return { ...completed, turns: overrides.map((override, index) => ({ ...first, index, ...override })) };
}

describe("Debrief", () => {
  it("shows the overall verdict and a meter per criterion", () => {
    render(<Debrief view={completed} />);
    expect(screen.getByText("3.6")).toBeDefined();
    expect(screen.getByText("Pass · pass mark 3.5")).toBeDefined();
    expect(screen.getByRole("meter", { name: "Structure" }).getAttribute("aria-valuenow")).toBe("4");
    // Criteria without a label fall back to their id.
    expect(screen.getByRole("meter", { name: "relevance" })).toBeDefined();
    expect(screen.getByText("I escalated, then complied.")).toBeDefined();
    expect(screen.getByText("Structure: 4/5")).toBeDefined();
  });

  it("flags failing results, follow-ups, overtime and empty answers", () => {
    const view = withTurns(
      { overtime: "soft", question: { questionId: "q1", text: "First?", askedAt: completed.turns[0]?.question.askedAt ?? "" } },
      {
        overtime: "hard",
        answer: { text: "  ", answeredAt: completed.turns[0]?.answer.answeredAt ?? "" },
        question: { questionId: "fu-0-1", text: "Second?", followUpOf: 0, askedAt: completed.turns[0]?.question.askedAt ?? "" },
        evaluation: evaluation(2),
      },
    );
    render(<Debrief view={{ ...view, scorecard: { ...view.scorecard, passed: false } }} />);
    expect(screen.getByText("Below the pass mark · pass mark 3.5")).toBeDefined();
    expect(screen.getByText("Over the suggested time")).toBeDefined();
    expect(screen.getByText("Over the time limit")).toBeDefined();
    expect(screen.getByText("Follow-up")).toBeDefined();
    expect(screen.getByText("(no answer)")).toBeDefined();
  });
});
