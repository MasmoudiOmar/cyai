import { z } from "zod";

import {
  followUpTriggerSchema,
  idSchema,
  isoDateTimeSchema,
  scoreSchema,
  textSchema,
} from "./primitives.js";
import { answerLimitsSchema } from "./profile.js";
import { scorecardSchema } from "./scorecard.js";

export const overtimeSchema = z.enum(["none", "soft", "hard"]);
export type Overtime = z.infer<typeof overtimeSchema>;

export const askedQuestionSchema = z.strictObject({
  questionId: idSchema,
  text: textSchema,
  /** Index of the turn this question probes further, when it is a follow-up. */
  followUpOf: z.int().nonnegative().optional(),
  askedAt: isoDateTimeSchema,
});
export type AskedQuestion = z.infer<typeof askedQuestionSchema>;

export const criterionScoreSchema = z.strictObject({
  criterionId: idSchema,
  score: scoreSchema,
});
export type CriterionScore = z.infer<typeof criterionScoreSchema>;

export const turnEvaluationSchema = z.strictObject({
  scores: z.array(criterionScoreSchema).min(1),
  followUpTriggers: z.array(followUpTriggerSchema),
  rationale: textSchema,
});
export type TurnEvaluation = z.infer<typeof turnEvaluationSchema>;

const answeredTurnShape = {
  index: z.int().nonnegative(),
  question: askedQuestionSchema,
  answer: z.strictObject({ text: z.string(), answeredAt: isoDateTimeSchema }),
  elapsedMs: z.int().nonnegative(),
  overtime: overtimeSchema,
};

export const answeredTurnSchema = z.strictObject(answeredTurnShape);
export type AnsweredTurn = z.infer<typeof answeredTurnSchema>;

export const evaluatedTurnSchema = z.strictObject({
  ...answeredTurnShape,
  evaluation: turnEvaluationSchema,
});
export type EvaluatedTurn = z.infer<typeof evaluatedTurnSchema>;

/** Session identifiers are UUIDs, which also makes them safe as file names. */
export const sessionIdSchema = z.uuid();

const baseShape = {
  id: sessionIdSchema,
  interviewId: idSchema,
  profileId: idSchema,
  rubricId: idSchema,
  answerLimits: answerLimitsSchema,
  createdAt: isoDateTimeSchema,
};

const startedShape = {
  ...baseShape,
  startedAt: isoDateTimeSchema,
  turns: z.array(evaluatedTurnSchema),
};

const endedShape = { ...startedShape, endedAt: isoDateTimeSchema };

export const createdSessionSchema = z.strictObject({
  status: z.literal("created"),
  ...baseShape,
});

export const awaitingQuestionSessionSchema = z.strictObject({
  status: z.literal("awaiting_question"),
  ...startedShape,
});

export const awaitingAnswerSessionSchema = z.strictObject({
  status: z.literal("awaiting_answer"),
  ...startedShape,
  pending: askedQuestionSchema,
});

export const awaitingEvaluationSessionSchema = z.strictObject({
  status: z.literal("awaiting_evaluation"),
  ...startedShape,
  answered: answeredTurnSchema,
});

export const scoringSessionSchema = z.strictObject({
  status: z.literal("scoring"),
  ...endedShape,
});

export const completedSessionSchema = z.strictObject({
  status: z.literal("completed"),
  ...endedShape,
  scorecard: scorecardSchema,
});

export const abandonedSessionSchema = z.strictObject({
  status: z.literal("abandoned"),
  ...baseShape,
  startedAt: isoDateTimeSchema.optional(),
  turns: z.array(evaluatedTurnSchema),
  endedAt: isoDateTimeSchema,
  reason: textSchema,
});

/** A practice session. Each status carries exactly the data valid in that state. */
export const sessionSchema = z.discriminatedUnion("status", [
  createdSessionSchema,
  awaitingQuestionSessionSchema,
  awaitingAnswerSessionSchema,
  awaitingEvaluationSessionSchema,
  scoringSessionSchema,
  completedSessionSchema,
  abandonedSessionSchema,
]);
export type Session = z.infer<typeof sessionSchema>;
export type SessionStatus = Session["status"];

/** The session type narrowed to one status. */
export type SessionIn<S extends SessionStatus> = Extract<Session, { status: S }>;
