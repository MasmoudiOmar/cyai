// @vitest-environment jsdom
import { evaluation } from "@cyai/fixtures";
import type { CompletedView, EvaluatedTurn } from "@cyai/spec";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "../test-support/dom.js";
import { completed } from "../test-support/views.js";
import { Debrief } from "./Debrief.js";

function turn(index: number, overrides: Partial<EvaluatedTurn>): EvaluatedTurn {
  const [first] = completed.turns;
  if (first === undefined) {
    throw new Error("fixture has no turn");
  }
  return { ...first, index, ...overrides };
}

/** The strongest and weakest criterion labels. */
function highlights(): (string | null | undefined)[] {
  return ["Strongest", "Work on next"].map((title) => screen.getByText(title).nextSibling?.textContent);
}

describe("Debrief", () => {
  it("shows the verdict, highlights and a meter per criterion", () => {
    render(<Debrief view={completed} />);
    expect(screen.getByRole("heading", { name: "AI Trainer" })).toBeDefined();
    expect(screen.getByText("3.6")).toBeDefined();
    expect(screen.getByText("Pass")).toBeDefined();
    expect(screen.getByText("Pass mark 3.5")).toBeDefined();
    expect(screen.getByText("1 answer scored")).toBeDefined();
    // Criteria without a label fall back to their id.
    expect(highlights()).toEqual(["Structure", "relevance"]);
    expect(screen.getByRole("meter", { name: "Structure" }).getAttribute("aria-valuenow")).toBe("4");
    expect(screen.getByRole("link", { name: /Practise again/ }).getAttribute("href")).toBe("#/practice/ai-trainer-generalist");
    expect(screen.getByText("I escalated, then complied.")).toBeDefined();
    expect(screen.getByText("Structure · 4/5")).toBeDefined();
  });

  it("flags failing results, follow-ups, overtime and empty answers", () => {
    const [first] = completed.turns;
    const askedAt = first?.question.askedAt ?? "";
    const view: CompletedView = {
      ...completed,
      scorecard: {
        ...completed.scorecard,
        criteria: [...completed.scorecard.criteria].reverse(),
        passed: false,
        evaluatedTurns: 2,
      },
      turns: [
        turn(0, { overtime: "soft" }),
        turn(1, {
          overtime: "hard",
          answer: { text: "  ", answeredAt: askedAt },
          question: { questionId: "fu-0-1", text: "Second?", followUpOf: 0, askedAt },
          evaluation: evaluation(2),
        }),
      ],
    };
    render(<Debrief view={view} />);
    expect(screen.getByText("Below the pass mark")).toBeDefined();
    expect(highlights()).toEqual(["Structure", "relevance"]);
    expect(screen.getByText("2 answers scored")).toBeDefined();
    expect(screen.getByText("Over the suggested time")).toBeDefined();
    expect(screen.getByText("Over the time limit")).toBeDefined();
    expect(screen.getByText("Follow-up")).toBeDefined();
    expect(screen.getByText("(no answer)")).toBeDefined();
    expect(screen.getByText("2.0")).toBeDefined();
  });
});
