import type {
  InterviewerProfile,
  InterviewSpec,
  IsoDateTime,
  Rubric,
  TurnEvaluation,
} from "@cyai/spec";

/** Fixed epoch so every test is deterministic. */
export const EPOCH_MS = Date.UTC(2026, 0, 1, 9, 0, 0);

/** ISO timestamp `seconds` after the fixture epoch. */
export function at(seconds: number): IsoDateTime {
  return new Date(EPOCH_MS + seconds * 1000).toISOString();
}

export const SESSION_ID = "6f1c2d3e-4a5b-4c6d-8e7f-901234567890";

export const genericProfile: InterviewerProfile = {
  id: "live-adaptive-generic",
  version: 1,
  name: "Adaptive AI Interviewer (generic)",
  description: "Conversational AI screener that probes your resume and the job description.",
  format: "live",
  modalities: ["text"],
  timing: {
    totalMinutes: 25,
    prepSeconds: 0,
    answer: { softSeconds: 120, hardSeconds: 180 },
  },
  turnPolicy: {
    maxQuestions: 2,
    maxFollowUpsPerQuestion: 1,
    followUpTriggers: ["vague", "no_example"],
  },
  persona: { tone: "neutral-friendly", reactsEmotionally: false },
  contextSources: ["resume", "job_description"],
};

export const starRubric: Rubric = {
  id: "behavioral-star",
  version: 1,
  name: "Behavioral (STAR)",
  passThreshold: 3.5,
  criteria: [
    {
      id: "structure",
      label: "Structure",
      weight: 0.6,
      levels: [
        { score: 1, description: "No clear situation, action or result" },
        { score: 5, description: "Clear STAR with a quantified result" },
      ],
    },
    {
      id: "relevance",
      label: "Relevance",
      weight: 0.4,
      levels: [
        { score: 1, description: "Unrelated to the role" },
        { score: 5, description: "Directly maps to the job description" },
      ],
    },
  ],
};

export const aiTrainerInterview: InterviewSpec = {
  id: "ai-trainer-generalist",
  version: 1,
  role: "AI Trainer",
  profileId: genericProfile.id,
  rubricId: starRubric.id,
  competencies: ["guideline-following", "written-reasoning"],
  questionBank: [
    {
      kind: "fixed",
      id: "q1",
      text: "Tell me about a time you followed a guideline you disagreed with.",
      competency: "guideline-following",
    },
    { kind: "generated", source: "resume", count: 2 },
  ],
};

/** An evaluation scoring every fixture criterion with `score`. */
export function evaluation(
  score: number,
  followUpTriggers: TurnEvaluation["followUpTriggers"] = [],
): TurnEvaluation {
  return {
    scores: starRubric.criteria.map((criterion) => ({ criterionId: criterion.id, score })),
    followUpTriggers,
    rationale: "Fixture evaluation",
  };
}
