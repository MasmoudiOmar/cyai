import { z } from "zod";

import { averageScoreSchema, idSchema, isoDateTimeSchema, textSchema } from "./primitives.js";
import { interviewFormatSchema } from "./profile.js";
import { scorecardSchema } from "./scorecard.js";
import { evaluatedTurnSchema, sessionIdSchema, type SessionStatus } from "./session.js";

/**
 * What user interfaces (terminal, web, agents) show. These shapes cross process
 * boundaries, so they are schemas: the web client validates every response with them.
 */

/** Every session status; `satisfies` makes the compiler reject a missing or extra one. */
const SESSION_STATUSES = {
  created: "created",
  awaiting_question: "awaiting_question",
  awaiting_answer: "awaiting_answer",
  awaiting_evaluation: "awaiting_evaluation",
  scoring: "scoring",
  completed: "completed",
  abandoned: "abandoned",
} as const satisfies { readonly [S in SessionStatus]: S };

export const sessionStatusSchema = z.enum(SESSION_STATUSES);

export const interviewSummarySchema = z.strictObject({
  id: idSchema,
  role: textSchema,
  profile: textSchema,
  format: interviewFormatSchema,
  totalMinutes: z.number().positive(),
  maxQuestions: z.int().positive(),
});
export type InterviewSummary = z.infer<typeof interviewSummarySchema>;

export const sessionSummarySchema = z.strictObject({
  sessionId: sessionIdSchema,
  interviewId: idSchema,
  status: sessionStatusSchema,
  createdAt: isoDateTimeSchema,
  overall: averageScoreSchema.optional(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const questionViewSchema = z.strictObject({
  kind: z.literal("question"),
  sessionId: sessionIdSchema,
  role: textSchema,
  number: z.int().positive(),
  maxQuestions: z.int().positive(),
  text: textSchema,
  followUp: z.boolean(),
  prepSeconds: z.int().nonnegative(),
  softSeconds: z.int().positive(),
  hardSeconds: z.int().positive(),
});
export type QuestionView = z.infer<typeof questionViewSchema>;

export const criterionLabelSchema = z.strictObject({ id: idSchema, label: textSchema });
export type CriterionLabel = z.infer<typeof criterionLabelSchema>;

export const completedViewSchema = z.strictObject({
  kind: z.literal("completed"),
  sessionId: sessionIdSchema,
  role: textSchema,
  scorecard: scorecardSchema,
  passThreshold: averageScoreSchema,
  criteria: z.array(criterionLabelSchema),
  turns: z.array(evaluatedTurnSchema),
});
export type CompletedView = z.infer<typeof completedViewSchema>;

export const abandonedViewSchema = z.strictObject({
  kind: z.literal("abandoned"),
  sessionId: sessionIdSchema,
  role: textSchema,
  reason: textSchema,
});
export type AbandonedView = z.infer<typeof abandonedViewSchema>;

/** Where a practice session stands, as a candidate sees it. */
export const practiceViewSchema = z.discriminatedUnion("kind", [
  questionViewSchema,
  completedViewSchema,
  abandonedViewSchema,
]);
export type PracticeView = z.infer<typeof practiceViewSchema>;

/** Resumes and job descriptions are pasted text; this bounds request bodies. */
export const CANDIDATE_TEXT_MAX = 50_000;

const candidateText = z.string().max(CANDIDATE_TEXT_MAX).optional();

export const startPracticeSchema = z.strictObject({
  interviewId: idSchema,
  resume: candidateText,
  jobDescription: candidateText,
});
export type StartPractice = z.infer<typeof startPracticeSchema>;

export const answerSchema = z.strictObject({ answer: z.string().max(CANDIDATE_TEXT_MAX) });
export type AnswerInput = z.infer<typeof answerSchema>;

export const errorBodySchema = z.strictObject({ error: z.string() });
export type ErrorBody = z.infer<typeof errorBodySchema>;

export const appInfoSchema = z.strictObject({ version: z.string(), model: z.string() });
export type AppInfo = z.infer<typeof appInfoSchema>;
