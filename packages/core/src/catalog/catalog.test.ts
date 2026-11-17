import { aiTrainerInterview, genericProfile, starRubric } from "@cyai/fixtures";
import { describe, expect, it } from "vitest";

import { candidate } from "../test-support/interview.js";
import { unwrap, unwrapErr } from "../test-support/drive.js";
import { buildCatalog, resolveInterview, type TemplateDocuments } from "./catalog.js";

const documents: TemplateDocuments = {
  profiles: [genericProfile],
  rubrics: [starRubric],
  interviews: [aiTrainerInterview],
};

describe("buildCatalog", () => {
  it("indexes templates by id", () => {
    const catalog = unwrap(buildCatalog(documents));
    expect(catalog.interviews.get(aiTrainerInterview.id)).toBe(aiTrainerInterview);
  });

  it.each([
    ["profile", { ...documents, profiles: [genericProfile, genericProfile] }],
    ["rubric", { ...documents, rubrics: [starRubric, starRubric] }],
    ["interview", { ...documents, interviews: [aiTrainerInterview, aiTrainerInterview] }],
  ] as const)("rejects duplicate %s ids", (kind, duplicated) => {
    expect(unwrapErr(buildCatalog(duplicated))).toMatchObject({ code: "duplicate_template", kind });
  });
});

describe("resolveInterview", () => {
  it("resolves the interview with its profile, rubric and candidate", () => {
    const context = unwrap(resolveInterview(unwrap(buildCatalog(documents)), aiTrainerInterview.id, candidate));
    expect(context).toEqual({ interview: aiTrainerInterview, profile: genericProfile, rubric: starRubric, candidate });
  });

  it.each([
    ["interview", documents, "missing-interview"],
    ["profile", { ...documents, profiles: [] }, aiTrainerInterview.id],
    ["rubric", { ...documents, rubrics: [] }, aiTrainerInterview.id],
  ] as const)("reports an unknown %s", (kind, docs, interviewId) => {
    expect(unwrapErr(resolveInterview(unwrap(buildCatalog(docs)), interviewId, {}))).toEqual({
      code: "unknown_template",
      kind,
      id: kind === "interview" ? interviewId : kind === "profile" ? genericProfile.id : starRubric.id,
    });
  });
});
