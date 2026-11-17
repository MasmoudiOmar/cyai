import { z } from "zod";

import {
  averageScoreSchema,
  DUPLICATE_ID_MESSAGE,
  hasUniqueIds,
  idSchema,
  scoreSchema,
  textSchema,
  versionSchema,
} from "./primitives.js";

/** Tolerance used when checking that criterion weights sum to 1. */
export const WEIGHT_SUM_TOLERANCE = 1e-9;

export const rubricLevelSchema = z.strictObject({
  score: scoreSchema,
  description: textSchema,
});
export type RubricLevel = z.infer<typeof rubricLevelSchema>;

export const criterionSchema = z.strictObject({
  id: idSchema,
  label: textSchema,
  weight: z.number().gt(0).lte(1),
  levels: z.array(rubricLevelSchema).min(2),
});
export type Criterion = z.infer<typeof criterionSchema>;

/** How answers are judged: weighted criteria and a pass threshold. */
export const rubricSchema = z
  .strictObject({
    id: idSchema,
    version: versionSchema,
    name: textSchema,
    criteria: z.array(criterionSchema).min(1),
    passThreshold: averageScoreSchema,
  })
  .refine((rubric) => hasUniqueIds(rubric.criteria), {
    message: DUPLICATE_ID_MESSAGE,
    path: ["criteria"],
  })
  .refine(
    (rubric) =>
      Math.abs(rubric.criteria.reduce((sum, criterion) => sum + criterion.weight, 0) - 1) <=
      WEIGHT_SUM_TOLERANCE,
    { message: "Criterion weights must sum to 1", path: ["criteria"] },
  );
export type Rubric = z.infer<typeof rubricSchema>;
