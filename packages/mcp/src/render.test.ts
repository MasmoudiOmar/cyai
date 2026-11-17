import { at, SESSION_ID } from "@cyai/fixtures";
import { describe, expect, it } from "vitest";

import { renderError, renderInterviews, renderReply, renderSessions } from "./render.js";
import type { Reply, ServiceError } from "./service.js";

const request = { system: "SYSTEM", user: "USER", response: { name: "interview_question", schema: {} } };

const question: Extract<Reply, { kind: "question" }> = {
  kind: "question",
  sessionId: SESSION_ID,
  role: "AI Trainer",
  number: 2,
  maxQuestions: 5,
  text: "Why us?",
  followUp: true,
  prepSeconds: 30,
  softSeconds: 90,
  hardSeconds: 120,
};

describe("renderReply", () => {
  it("tells the agent to ask the question verbatim and submit the answer", () => {
    const text = renderReply(question);
    expect(text).toContain("**Question 2 (follow-up)**\n\n> Why us?");
    expect(text).toContain("They get 30s to prepare. They should answer within 90s; 120s is the hard limit.");
    expect(text).toContain(`\`submit_answer\` with sessionId "${SESSION_ID}"`);
    expect(renderReply({ ...question, followUp: false, prepSeconds: 0 })).not.toMatch(/follow-up\)|to prepare/);
  });

  it("keeps question-writing and evaluation instructions private", () => {
    expect(renderReply({ kind: "write_question", sessionId: SESSION_ID, request })).toContain(
      "<interviewer_instructions>\nSYSTEM\n\nUSER\n</interviewer_instructions>",
    );
    expect(renderReply({ kind: "evaluate", sessionId: SESSION_ID, request })).toContain("`submit_evaluation`");
  });

  it("ends the debrief with a prompt to share it", () => {
    const reply: Reply = {
      kind: "completed",
      sessionId: SESSION_ID,
      role: "AI Trainer",
      scorecard: { criteria: [{ criterionId: "structure", average: 4, samples: 1 }], overall: 4, passed: true, evaluatedTurns: 1 },
      passThreshold: 3.5,
      criteria: [{ id: "structure", label: "Structure" }],
      turns: [],
    };
    expect(renderReply(reply)).toMatch(/^## Interview complete: AI Trainer[\s\S]*Share this debrief with the candidate/);
  });

  it("confirms an abandoned session", () => {
    expect(renderReply({ kind: "abandoned", sessionId: SESSION_ID, role: "AI Trainer", reason: "Left" })).toBe(
      `Interview ${SESSION_ID} has ended: Left`,
    );
  });
});

describe("renderError", () => {
  const cases: readonly [ServiceError, string][] = [
    [{ code: "wrong_status", sessionId: SESSION_ID, expected: "awaiting_answer", actual: "completed" }, `is "completed", not "awaiting_answer". Call \`resume_interview\``],
    [{ code: "invalid_response", response: "answer_evaluation", message: "bad" }, "invalid: bad. Fix it and call the tool again."],
    [{ code: "unknown_criterion", criterionId: "x" }, "Score each rubric criterion exactly once."],
    [{ code: "duplicate_criterion", criterionId: "x" }, "Score each rubric criterion exactly once."],
    [{ code: "unknown_template", kind: "interview", id: "x" }, 'Unknown interview "x". Call `list_interviews`'],
    [{ code: "no_question_expected" }, "Call `resume_interview` to get it."],
    [{ code: "no_evaluated_turns" }, "nothing to score."],
  ];

  it.each(cases)("explains %j with a recovery hint where one exists", (error, fragment) => {
    expect(renderError(error)).toContain(fragment);
  });
});

describe("listings", () => {
  it("renders interviews and sessions, or says there are none", () => {
    expect(renderInterviews([])).toBe("No interviews are installed.");
    expect(
      renderInterviews([
        { id: "ai-trainer-generalist", role: "AI Trainer", profile: "Adaptive", format: "live", totalMinutes: 25, maxQuestions: 6 },
      ]),
    ).toContain("| ai-trainer-generalist | AI Trainer | Adaptive (live) | 25 min | up to 6 |");
    expect(renderSessions([])).toBe("No practice sessions yet.");
    const sessions = renderSessions([
      { sessionId: "s1", interviewId: "i", status: "completed", createdAt: at(0), overall: 3.456 },
      { sessionId: "s2", interviewId: "i", status: "awaiting_answer", createdAt: at(0) },
    ]);
    expect(sessions).toContain("| completed | 2026-01-01T09:00:00.000Z | 3.46 |");
    expect(sessions).toContain("| awaiting_answer | 2026-01-01T09:00:00.000Z | - |");
  });
});
