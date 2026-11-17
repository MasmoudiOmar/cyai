import { aiTrainerInterview, at, genericProfile, SESSION_ID } from "@cyai/fixtures";
import { sessionSchema } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import { fixedClock, fixedIds, newSession, unwrapErr } from "../test-support/drive.js";
import { createSession } from "./create.js";

describe("createSession", () => {
  it("creates a schema-valid session bound to the interview and profile", () => {
    const session = newSession();
    expect(session).toEqual({
      status: "created",
      id: SESSION_ID,
      interviewId: aiTrainerInterview.id,
      profileId: genericProfile.id,
      rubricId: aiTrainerInterview.rubricId,
      answerLimits: genericProfile.timing.answer,
      createdAt: at(0),
    });
    expect(sessionSchema.safeParse(session).success).toBe(true);
  });

  it("rejects a profile the interview is not bound to", () => {
    const profile = { ...genericProfile, id: "other-profile" };
    const error = unwrapErr(
      createSession({ interview: aiTrainerInterview, profile }, { clock: fixedClock, ids: fixedIds }),
    );
    expect(error).toEqual({
      code: "binding_mismatch",
      kind: "profile",
      expected: genericProfile.id,
      received: "other-profile",
    });
  });
});
