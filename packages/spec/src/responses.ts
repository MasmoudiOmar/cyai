import { z } from "zod";

import { followUpTriggerSchema, SCORE_MAX, SCORE_MIN, textSchema } from "./primitives.js";
import { err, ok, type Result } from "./result.js";
import { turnEvaluationSchema, type TurnEvaluation } from "./session.js";

/** JSON Schema handed to a model for structured output (no `$schema` key). */
export type JsonSchema = Omit<z.core.JSONSchema.BaseSchema, "$schema">;

/**
 * A structured response expected from a model or agent.
 * `schema` is deliberately loose (model-friendly). `parse` then enforces the canonical
 * schema, so invariants such as non-empty text hold no matter who produced the value.
 */
export interface ResponseFormat<T> {
  readonly name: string;
  readonly schema: JsonSchema;
  readonly parse: (raw: unknown) => Result<T, string>;
}

/** One-line, path-prefixed summary of schema validation issues. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
}

function responseFormat<T>(name: string, modelSchema: z.ZodType, canonical: z.ZodType<T>): ResponseFormat<T> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(modelSchema);
  return {
    name,
    schema,
    parse: (raw): Result<T, string> => {
      const loose = modelSchema.safeParse(raw);
      if (!loose.success) {
        return err(describeIssues(loose.error));
      }
      const strict = canonical.safeParse(loose.data);
      return strict.success ? ok(strict.data) : err(describeIssues(strict.error));
    },
  };
}

const SCORES = Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, offset) => SCORE_MIN + offset);

export const questionDraftSchema = z.strictObject({ text: textSchema });
export type QuestionDraft = z.infer<typeof questionDraftSchema>;

/** The next interview question, as written by a model or agent. */
export const questionResponseFormat: ResponseFormat<QuestionDraft> = responseFormat(
  "interview_question",
  z.strictObject({ text: z.string() }),
  questionDraftSchema,
);

/** A rubric evaluation of one answer, restricted to the given criterion ids. */
export function evaluationResponseFormat(criterionIds: readonly string[]): ResponseFormat<TurnEvaluation> {
  return responseFormat(
    "answer_evaluation",
    z.strictObject({
      scores: z.array(z.strictObject({ criterionId: z.literal(criterionIds), score: z.literal(SCORES) })),
      followUpTriggers: z.array(followUpTriggerSchema),
      rationale: z.string(),
    }),
    turnEvaluationSchema,
  );
}
