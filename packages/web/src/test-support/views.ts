import { at, evaluation, SESSION_ID } from "@cyai/fixtures";
import { ok, type AbandonedView, type CompletedView, type InterviewSummary, type QuestionView, type SessionSummary } from "@cyai/spec";

import type { ApiClient } from "../api.js";

export const interview: InterviewSummary = {
  id: "ai-trainer-generalist",
  role: "AI Trainer",
  profile: "Adaptive AI interviewer",
  format: "live",
  totalMinutes: 25,
  maxQuestions: 2,
};

export const question: QuestionView = {
  kind: "question",
  sessionId: SESSION_ID,
  role: "AI Trainer",
  number: 1,
  maxQuestions: 2,
  text: "Tell me about a guideline you disagreed with.",
  followUp: false,
  prepSeconds: 0,
  softSeconds: 60,
  hardSeconds: 90,
};

export const completed: CompletedView = {
  kind: "completed",
  sessionId: SESSION_ID,
  role: "AI Trainer",
  scorecard: {
    criteria: [
      { criterionId: "structure", average: 4, samples: 1 },
      { criterionId: "relevance", average: 3, samples: 1 },
    ],
    overall: 3.6,
    passed: true,
    evaluatedTurns: 1,
  },
  passThreshold: 3.5,
  criteria: [{ id: "structure", label: "Structure" }],
  turns: [
    {
      index: 0,
      question: { questionId: "q1", text: "Tell me about a guideline you disagreed with.", askedAt: at(0) },
      answer: { text: "I escalated, then complied.", answeredAt: at(30) },
      elapsedMs: 30_000,
      overtime: "none",
      evaluation: evaluation(4),
    },
  ],
};

export const abandoned: AbandonedView = { kind: "abandoned", sessionId: SESSION_ID, role: "AI Trainer", reason: "Stopped in the web app." };

export const session: SessionSummary = {
  sessionId: SESSION_ID,
  interviewId: "ai-trainer-generalist",
  status: "completed",
  createdAt: at(0),
  overall: 3.6,
};

/** An API client answering with the fixtures above; override any call. */
export function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    info: () => Promise.resolve(ok({ version: "0.1.0", model: "claude-opus-5-5" })),
    interviews: () => Promise.resolve(ok([interview])),
    sessions: () => Promise.resolve(ok([session])),
    start: () => Promise.resolve(ok(question)),
    session: () => Promise.resolve(ok(question)),
    answer: () => Promise.resolve(ok(completed)),
    abandon: () => Promise.resolve(ok(abandoned)),
    ...overrides,
  };
}
