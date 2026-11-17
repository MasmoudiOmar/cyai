import { z } from "zod";

import { speechMeasurementSchema, transcriberSchema } from "./delivery.js";
import { averageScoreSchema, idSchema, isoDateTimeSchema, textSchema } from "./primitives.js";
import { interviewFormatSchema, turnTakingSchema } from "./profile.js";
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

/** The interviewer's clock and how turns end, shown before and during an interview. */
const timingShape = {
  prepSeconds: z.int().nonnegative(),
  softSeconds: z.int().positive(),
  hardSeconds: z.int().positive(),
  turnTaking: turnTakingSchema,
};

export const interviewSummarySchema = z.strictObject({
  id: idSchema,
  role: textSchema,
  profile: textSchema,
  format: interviewFormatSchema,
  totalMinutes: z.number().positive(),
  maxQuestions: z.int().positive(),
  ...timingShape,
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
  interviewId: idSchema,
  role: textSchema,
  number: z.int().positive(),
  maxQuestions: z.int().positive(),
  text: textSchema,
  followUp: z.boolean(),
  ...timingShape,
});
export type QuestionView = z.infer<typeof questionViewSchema>;

export const criterionLabelSchema = z.strictObject({ id: idSchema, label: textSchema });
export type CriterionLabel = z.infer<typeof criterionLabelSchema>;

export const completedViewSchema = z.strictObject({
  kind: z.literal("completed"),
  sessionId: sessionIdSchema,
  interviewId: idSchema,
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
  interviewId: idSchema,
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

export const answerSchema = z.strictObject({
  answer: z.string().max(CANDIDATE_TEXT_MAX),
  /** Microphone timing, sent only for spoken answers. */
  speech: speechMeasurementSchema.optional(),
});
export type AnswerInput = z.infer<typeof answerSchema>;

export const errorBodySchema = z.strictObject({ error: z.string() });
export type ErrorBody = z.infer<typeof errorBodySchema>;

/** Which speech services the server offers; the browser stands in for any that is missing. */
export const voiceInfoSchema = z.strictObject({
  transcription: transcriberSchema,
  voice: z.enum(["endpoint", "browser"]),
});
export type VoiceInfo = z.infer<typeof voiceInfoSchema>;

export const appInfoSchema = z.strictObject({ version: z.string(), model: z.string(), voice: voiceInfoSchema });
export type AppInfo = z.infer<typeof appInfoSchema>;

/** Longest interviewer line sent for synthesis. */
export const SPOKEN_TEXT_MAX = 2_000;

export const speakSchema = z.strictObject({ text: z.string().trim().min(1).max(SPOKEN_TEXT_MAX) });
export type SpeakInput = z.infer<typeof speakSchema>;

export const transcriptionSchema = z.strictObject({ text: z.string() });
export type Transcription = z.infer<typeof transcriptionSchema>;
