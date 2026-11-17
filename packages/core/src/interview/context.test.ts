import { genericProfile, starRubric } from "@cyai/fixtures";
import { describe, expect, it } from "vitest";

import { unwrap, unwrapErr } from "../test-support/drive.js";
import { fixtureContext } from "../test-support/interview.js";
import { createContext } from "./context.js";

describe("createContext", () => {
  it("accepts a correctly bound context", () => {
    expect(unwrap(createContext(fixtureContext()))).toEqual(fixtureContext());
  });

  it.each([
    ["profile", fixtureContext({ profile: { ...genericProfile, id: "other" } })],
    ["rubric", fixtureContext({ rubric: { ...starRubric, id: "other" } })],
  ] as const)("rejects a mismatched %s", (kind, context) => {
    expect(unwrapErr(createContext(context))).toMatchObject({ code: "binding_mismatch", kind, received: "other" });
  });
});
