import { z } from "zod";

import { averageScoreSchema, idSchema } from "./primitives.js";

export const criterionResultSchema = z.strictObject({
  criterionId: idSchema,
  average: averageScoreSchema,
  samples: z.int().positive(),
});
export type CriterionResult = z.infer<typeof criterionResultSchema>;

/** Final, rubric-weighted outcome of a session. */
export const scorecardSchema = z.strictObject({
  criteria: z.array(criterionResultSchema).min(1),
  overall: averageScoreSchema,
  passed: z.boolean(),
  evaluatedTurns: z.int().positive(),
});
export type Scorecard = z.infer<typeof scorecardSchema>;
