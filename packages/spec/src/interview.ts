import { z } from "zod";

import {
  candidateContextSourceSchema,
  DUPLICATE_ID_MESSAGE,
  hasUniqueIds,
  idSchema,
  textSchema,
  versionSchema,
} from "./primitives.js";

export const fixedQuestionSchema = z.strictObject({
  kind: z.literal("fixed"),
  id: idSchema,
  text: textSchema,
  competency: idSchema,
});
export type FixedQuestion = z.infer<typeof fixedQuestionSchema>;

export const generatedQuestionsSchema = z.strictObject({
  kind: z.literal("generated"),
  source: candidateContextSourceSchema,
  count: z.int().positive(),
});
export type GeneratedQuestions = z.infer<typeof generatedQuestionsSchema>;

export const questionBankEntrySchema = z.discriminatedUnion("kind", [
  fixedQuestionSchema,
  generatedQuestionsSchema,
]);
export type QuestionBankEntry = z.infer<typeof questionBankEntrySchema>;

function fixedQuestions(entries: readonly QuestionBankEntry[]): FixedQuestion[] {
  return entries.filter((entry): entry is FixedQuestion => entry.kind === "fixed");
}

/** What is asked: role, competencies and the question bank, bound to a profile and rubric. */
export const interviewSpecSchema = z
  .strictObject({
    id: idSchema,
    version: versionSchema,
    role: textSchema,
    profileId: idSchema,
    rubricId: idSchema,
    competencies: z.array(idSchema).min(1),
    questionBank: z.array(questionBankEntrySchema).min(1),
  })
  .refine((spec) => hasUniqueIds(fixedQuestions(spec.questionBank)), {
    message: DUPLICATE_ID_MESSAGE,
    path: ["questionBank"],
  })
  .refine(
    (spec) =>
      fixedQuestions(spec.questionBank).every((question) =>
        spec.competencies.includes(question.competency),
      ),
    { message: "Every fixed question must target a declared competency", path: ["questionBank"] },
  );
export type InterviewSpec = z.infer<typeof interviewSpecSchema>;
