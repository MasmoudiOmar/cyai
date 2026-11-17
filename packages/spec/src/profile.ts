import { z } from "zod";

import {
  candidateContextSourceSchema,
  followUpTriggerSchema,
  idSchema,
  textSchema,
  versionSchema,
} from "./primitives.js";

export const interviewFormatSchema = z.enum(["async", "live", "chat"]);
export type InterviewFormat = z.infer<typeof interviewFormatSchema>;

export const modalitySchema = z.enum(["text", "voice", "video"]);
export type Modality = z.infer<typeof modalitySchema>;

/** Answer time limits: past `softSeconds` is overtime, past `hardSeconds` is cut off. */
export const answerLimitsSchema = z
  .strictObject({
    softSeconds: z.int().positive(),
    hardSeconds: z.int().positive(),
  })
  .refine((limits) => limits.hardSeconds >= limits.softSeconds, {
    message: "hardSeconds must be greater than or equal to softSeconds",
    path: ["hardSeconds"],
  });
export type AnswerLimits = z.infer<typeof answerLimitsSchema>;

/**
 * How a turn is taken. Typed answers are submitted. Spoken answers end either after a long
 * silence (conversational voice screeners) or when the recording window closes (one-way screens).
 */
export const turnTakingSchema = z.discriminatedUnion("endOfTurn", [
  z.strictObject({ answer: z.literal("typed"), endOfTurn: z.literal("submit") }),
  z.strictObject({
    answer: z.literal("spoken"),
    endOfTurn: z.literal("silence"),
    /** Silence after the candidate has spoken that ends the answer. */
    endSilenceSeconds: z.number().positive(),
    /** Silence before the candidate says anything that makes the interviewer cut in. */
    nudgeAfterSeconds: z.number().positive(),
  }),
  z.strictObject({ answer: z.literal("spoken"), endOfTurn: z.literal("timer") }),
]);
export type TurnTaking = z.infer<typeof turnTakingSchema>;

/** How an interviewer behaves: format, timing, follow-up depth and persona. */
export const interviewerProfileSchema = z.strictObject({
  id: idSchema,
  version: versionSchema,
  name: textSchema,
  description: textSchema,
  format: interviewFormatSchema,
  modalities: z.array(modalitySchema).min(1),
  timing: z.strictObject({
    totalMinutes: z.int().positive(),
    prepSeconds: z.int().nonnegative(),
    answer: answerLimitsSchema,
  }),
  turnTaking: turnTakingSchema,
  turnPolicy: z.strictObject({
    maxQuestions: z.int().positive(),
    maxFollowUpsPerQuestion: z.int().nonnegative(),
    followUpTriggers: z.array(followUpTriggerSchema),
  }),
  persona: z.strictObject({
    tone: textSchema,
    reactsEmotionally: z.boolean(),
  }),
  contextSources: z.array(candidateContextSourceSchema),
});
export type InterviewerProfile = z.infer<typeof interviewerProfileSchema>;
