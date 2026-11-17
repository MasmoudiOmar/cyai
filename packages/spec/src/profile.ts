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
