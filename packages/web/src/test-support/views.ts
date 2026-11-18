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
  prepSeconds: 0,
  softSeconds: 60,
  hardSeconds: 90,
  turnTaking: { answer: "typed", endOfTurn: "submit" },
};

export const question: QuestionView = {
  kind: "question",
  sessionId: SESSION_ID,
  interviewId: "ai-trainer-generalist",
  role: "AI Trainer",
  number: 1,
  maxQuestions: 2,
  text: "Tell me about a guideline you disagreed with.",
  followUp: false,
  endsAt: at(1500),
  prepSeconds: 0,
  softSeconds: 60,
  hardSeconds: 90,
  turnTaking: { answer: "typed", endOfTurn: "submit" },
};

/** A conversational voice question: ends after a 4-second pause, nudges after 10 seconds of silence. */
export const spokenQuestion: QuestionView = {
  ...question,
  turnTaking: { answer: "spoken", endOfTurn: "silence", endSilenceSeconds: 4, nudgeAfterSeconds: 10 },
};

/** A one-way recorded question: 5 seconds to prepare, then recorded until Done or 30 seconds. */
export const recordedQuestion: QuestionView = {
  ...question,
  prepSeconds: 5,
  hardSeconds: 30,
  turnTaking: { answer: "spoken", endOfTurn: "timer" },
};

export const spokenInterview: InterviewSummary = { ...interview, turnTaking: spokenQuestion.turnTaking };

export const completed: CompletedView = {
  kind: "completed",
  sessionId: SESSION_ID,
  interviewId: "ai-trainer-generalist",
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

export const abandoned: AbandonedView = {
  kind: "abandoned",
  sessionId: SESSION_ID,
  interviewId: "ai-trainer-generalist",
  role: "AI Trainer",
  reason: "Stopped in the web app.",
};

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
    info: () => Promise.resolve(ok({ version: "0.1.0", model: "claude-opus-5-5", voice: { transcription: "browser", voice: "browser" } })),
    interviews: () => Promise.resolve(ok([interview])),
    sessions: () => Promise.resolve(ok([session])),
    start: () => Promise.resolve(ok(question)),
    session: () => Promise.resolve(ok(question)),
    answer: () => Promise.resolve(ok(completed)),
    abandon: () => Promise.resolve(ok(abandoned)),
    transcribe: () => Promise.resolve(ok("Um, I escalated it.")),
    speech: () => Promise.resolve(ok(new Blob([], { type: "audio/mpeg" }))),
    ...overrides,
  };
}
