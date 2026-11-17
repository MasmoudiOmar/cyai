/**
 * Schema tests for @cyai/spec. They live here because they need the shared fixtures,
 * and @cyai/spec must not depend on this package.
 */
import {
  hasUniqueIds,
  interviewerProfileSchema,
  interviewSpecSchema,
  rubricSchema,
  type InterviewSpec,
} from "@cyai/spec";
import { describe, expect, it } from "vitest";

import { aiTrainerInterview, genericProfile, starRubric } from "./index.js";

function issueMessages(result: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("fixtures", () => {
  it.each([
    ["profile", interviewerProfileSchema.safeParse(genericProfile)],
    ["rubric", rubricSchema.safeParse(starRubric)],
    ["interview", interviewSpecSchema.safeParse(aiTrainerInterview)],
  ] as const)("the %s fixture is schema-valid", (_name, result) => {
    expect(result.success).toBe(true);
  });
});

describe("interviewerProfileSchema", () => {
  it("rejects a hard answer limit below the soft limit", () => {
    const profile = {
      ...genericProfile,
      timing: { ...genericProfile.timing, answer: { softSeconds: 120, hardSeconds: 60 } },
    };
    expect(issueMessages(interviewerProfileSchema.safeParse(profile))).toEqual([
      "hardSeconds must be greater than or equal to softSeconds",
    ]);
  });

  it("rejects unknown keys", () => {
    expect(interviewerProfileSchema.safeParse({ ...genericProfile, extra: true }).success).toBe(false);
  });
});

describe("rubricSchema", () => {
  it("rejects duplicate criterion ids", () => {
    const [first] = starRubric.criteria;
    const rubric = { ...starRubric, criteria: [first, { ...first, weight: 0.4 }] };
    expect(issueMessages(rubricSchema.safeParse(rubric))).toEqual(["Identifiers must be unique"]);
  });

  it("rejects weights that do not sum to 1", () => {
    const rubric = {
      ...starRubric,
      criteria: starRubric.criteria.map((criterion) => ({ ...criterion, weight: 0.3 })),
    };
    expect(issueMessages(rubricSchema.safeParse(rubric))).toEqual(["Criterion weights must sum to 1"]);
  });
});

describe("interviewSpecSchema", () => {
  const withBank = (questionBank: InterviewSpec["questionBank"]): InterviewSpec => ({
    ...aiTrainerInterview,
    questionBank,
  });
  const question = {
    kind: "fixed",
    id: "q1",
    text: "Why this role?",
    competency: "written-reasoning",
  } as const;

  it("rejects duplicate fixed question ids", () => {
    expect(issueMessages(interviewSpecSchema.safeParse(withBank([question, question])))).toEqual([
      "Identifiers must be unique",
    ]);
  });

  it("rejects fixed questions targeting undeclared competencies", () => {
    const spec = withBank([{ ...question, competency: "juggling" }]);
    expect(issueMessages(interviewSpecSchema.safeParse(spec))).toEqual([
      "Every fixed question must target a declared competency",
    ]);
  });
});

describe("hasUniqueIds", () => {
  it("detects duplicates", () => {
    expect(hasUniqueIds([{ id: "a" }, { id: "b" }])).toBe(true);
    expect(hasUniqueIds([{ id: "a" }, { id: "a" }])).toBe(false);
  });
});
