import { buildCatalog } from "@cyai/core";
import { aiTrainerInterview, createdSession, evaluation, genericProfile, SESSION_ID, starRubric } from "@cyai/fixtures";
import { describe, expect, it } from "vitest";

import type { Reply, Served } from "./service.js";
import {
  expectKind,
  fixtureCatalog,
  harness,
  memoryStore,
  storedSession,
  unwrap,
  unwrapErr,
  type Harness,
} from "./test-support/harness.js";

const START = { interviewId: aiTrainerInterview.id, resume: "Annotator for five years", jobDescription: " " };

/** Drives a session to the point where the agent must write question 2. */
async function toGeneratedQuestion(h: Harness): Promise<void> {
  unwrap(await h.service.start(START));
  h.at(30);
  unwrap(await h.service.submitAnswer(SESSION_ID, "I raised it, then followed the guideline."));
  unwrap(await h.service.submitEvaluation(SESSION_ID, evaluation(4)));
}

/** Starts a session at 10s, then moves the clock back to 5s. */
async function startedThenRewound(): Promise<Harness> {
  const h = harness();
  h.at(10);
  unwrap(await h.service.start(START));
  h.at(5);
  return h;
}

describe("interview service", () => {
  it("runs a whole interview with the agent as interviewer and evaluator", async () => {
    const h = harness();
    const first = expectKind(unwrap(await h.service.start(START)), "question");
    expect(first).toMatchObject({ number: 1, followUp: false, softSeconds: 120, hardSeconds: 180 });
    expect(h.store.records.get(SESSION_ID)?.candidate).toEqual({ resume: "Annotator for five years" });

    h.at(30);
    const evaluate = expectKind(unwrap(await h.service.submitAnswer(SESSION_ID, "Answer one")), "evaluate");
    expect(evaluate.request.response.name).toBe("answer_evaluation");

    const write = expectKind(unwrap(await h.service.submitEvaluation(SESSION_ID, evaluation(4))), "write_question");
    expect(write.request.user).toContain("<resume>\nAnnotator for five years\n</resume>");

    h.at(40);
    const second = expectKind(unwrap(await h.service.provideQuestion(SESSION_ID, "Which project?")), "question");
    expect(second).toMatchObject({ number: 2, text: "Which project?" });

    h.at(70);
    unwrap(await h.service.submitAnswer(SESSION_ID, "Answer two"));
    const done = expectKind(unwrap(await h.service.submitEvaluation(SESSION_ID, evaluation(3))), "completed");
    expect(done).toMatchObject({ role: aiTrainerInterview.role, scorecard: { overall: 3.5, passed: true } });

    expect(unwrap(await h.service.listSessions())).toMatchObject([
      { sessionId: SESSION_ID, interviewId: aiTrainerInterview.id, status: "completed", overall: 3.5 },
    ]);
  });

  it("lists interviews whose profile is installed", () => {
    const orphan = { ...aiTrainerInterview, id: "orphan", profileId: "missing-profile" };
    const catalog = unwrap(buildCatalog({ profiles: [genericProfile], rubrics: [starRubric], interviews: [aiTrainerInterview, orphan] }));
    expect(harness(catalog).service.listInterviews().map((item) => item.id)).toEqual([aiTrainerInterview.id]);
  });

  describe("start", () => {
    it("rejects unknown interviews", async () => {
      expect(unwrapErr(await harness().service.start({ interviewId: "nope" }))).toMatchObject({
        code: "unknown_template",
      });
    });

    it.each([
      ["the session cannot start", [10, 5]],
      ["the first question cannot be asked", [0, 0, -1]],
    ])("reports when %s", async (_case, readings) => {
      const h = harness();
      h.readings.push(...readings);
      expect(unwrapErr(await h.service.start(START))).toMatchObject({ code: "clock_skew" });
    });

    it("reports storage failures", async () => {
      const h = harness();
      h.store.failing.add("save");
      expect(unwrapErr(await h.service.start(START))).toMatchObject({ code: "store_error" });
    });
  });

  describe("status checks", () => {
    it.each([
      ["provideQuestion", (h: Harness): Served<Reply> => h.service.provideQuestion(SESSION_ID, "Q?")],
      ["submitEvaluation", (h: Harness): Served<Reply> => h.service.submitEvaluation(SESSION_ID, evaluation(4))],
    ] as const)("%s rejects a session awaiting an answer", async (_name, call) => {
      const h = harness();
      unwrap(await h.service.start(START));
      expect(unwrapErr(await call(h))).toMatchObject({
        code: "wrong_status",
        sessionId: SESSION_ID,
        actual: "awaiting_answer",
      });
    });

    it("submitAnswer rejects a session that is not awaiting an answer", async () => {
      const h = harness();
      await toGeneratedQuestion(h);
      expect(unwrapErr(await h.service.submitAnswer(SESSION_ID, "again"))).toMatchObject({ code: "wrong_status" });
    });

    it("reports unknown sessions and sessions whose interview was removed", async () => {
      const store = memoryStore();
      unwrap(await harness(fixtureCatalog(), store).service.start(START));
      const empty = unwrap(buildCatalog({ profiles: [], rubrics: [], interviews: [] }));
      expect(unwrapErr(await harness(empty, store).service.resume(SESSION_ID))).toMatchObject({
        code: "unknown_template",
      });
      expect(unwrapErr(await harness().service.resume(SESSION_ID))).toMatchObject({ reason: "not_found" });
      expect(unwrapErr(await harness().service.submitAnswer(SESSION_ID, "A"))).toMatchObject({ reason: "not_found" });
    });
  });

  describe("step failures", () => {
    it("rejects an invalid generated question", async () => {
      const h = harness();
      await toGeneratedQuestion(h);
      expect(unwrapErr(await h.service.provideQuestion(SESSION_ID, " "))).toMatchObject({ code: "invalid_response" });
    });

    it("rejects an invalid evaluation", async () => {
      const h = harness();
      unwrap(await h.service.start(START));
      unwrap(await h.service.submitAnswer(SESSION_ID, "Answer"));
      expect(unwrapErr(await h.service.submitEvaluation(SESSION_ID, { scores: [] }))).toMatchObject({
        code: "invalid_response",
      });
    });

    it("rejects an answer timestamped before its question", async () => {
      const h = await startedThenRewound();
      expect(unwrapErr(await h.service.submitAnswer(SESSION_ID, "Answer"))).toMatchObject({ code: "clock_skew" });
    });

    it("reports a failed save of an answer", async () => {
      const h = harness();
      unwrap(await h.service.start(START));
      h.store.failing.add("save");
      expect(unwrapErr(await h.service.submitAnswer(SESSION_ID, "Answer"))).toMatchObject({ code: "store_error" });
    });

    it("reports a failed listing", async () => {
      const h = harness();
      h.store.failing.add("list");
      expect(unwrapErr(await h.service.listSessions())).toMatchObject({ code: "store_error" });
    });
  });

  describe("resume", () => {
    it("re-issues the question, the evaluation request, or the question-writing request", async () => {
      const h = harness();
      unwrap(await h.service.start(START));
      expect(unwrap(await h.service.resume(SESSION_ID)).kind).toBe("question");
      unwrap(await h.service.submitAnswer(SESSION_ID, "Answer"));
      expect(unwrap(await h.service.resume(SESSION_ID)).kind).toBe("evaluate");
      unwrap(await h.service.submitEvaluation(SESSION_ID, evaluation(4)));
      expect(unwrap(await h.service.resume(SESSION_ID)).kind).toBe("write_question");
    });

    it("reports a failure to conclude once the time budget is spent", async () => {
      const store = memoryStore();
      await toGeneratedQuestion(harness(fixtureCatalog(), store));
      const scaled = starRubric.criteria.map((criterion) => ({ ...criterion, weight: criterion.weight / 2 }));
      const extra = { id: "extra", label: "Extra", weight: 0.5, levels: scaled[0]?.levels ?? [] };
      const rubric = { ...starRubric, criteria: [...scaled, extra] };
      const catalog = unwrap(buildCatalog({ profiles: [genericProfile], rubrics: [rubric], interviews: [aiTrainerInterview] }));
      const later = harness(catalog, store);
      later.at(genericProfile.timing.totalMinutes * 60);
      expect(unwrapErr(await later.service.resume(SESSION_ID))).toEqual({ code: "unscored_criterion", criterionId: "extra" });
    });

    it("returns the debrief or the abandonment of finished sessions", async () => {
      const h = harness();
      unwrap(await h.service.start(START));
      unwrap(await h.service.abandon(SESSION_ID, "Had to leave"));
      expect(unwrap(await h.service.resume(SESSION_ID))).toMatchObject({ kind: "abandoned", reason: "Had to leave" });
    });

    it("returns the debrief of a completed session", async () => {
      const h = harness();
      await toGeneratedQuestion(h);
      unwrap(await h.service.provideQuestion(SESSION_ID, "Q2?"));
      unwrap(await h.service.submitAnswer(SESSION_ID, "A2"));
      unwrap(await h.service.submitEvaluation(SESSION_ID, evaluation(4)));
      expect(unwrap(await h.service.resume(SESSION_ID)).kind).toBe("completed");
    });

    it.each(["created", "scoring"] as const)("rejects a stored %s session", async (status) => {
      const h = harness();
      await toGeneratedQuestion(h);
      const session = storedSession(h.store);
      const broken =
        status === "created"
          ? createdSession()
          : session.status === "awaiting_question"
            ? { ...session, status: "scoring" as const, endedAt: session.startedAt }
            : session;
      h.store.records.set(SESSION_ID, { session: broken, candidate: {} });
      expect(unwrapErr(await h.service.resume(SESSION_ID))).toMatchObject({ code: "wrong_status", actual: status });
    });
  });

  describe("abandon", () => {
    it("refuses to abandon a finished session", async () => {
      const h = harness();
      unwrap(await h.service.start(START));
      unwrap(await h.service.abandon(SESSION_ID, "Stop"));
      expect(unwrapErr(await h.service.abandon(SESSION_ID, "Again"))).toMatchObject({
        code: "wrong_status",
        actual: "abandoned",
      });
    });

    it("reports clock, storage and lookup failures", async () => {
      const h = await startedThenRewound();
      expect(unwrapErr(await h.service.abandon(SESSION_ID, "Stop"))).toMatchObject({ code: "clock_skew" });
      h.at(20);
      h.store.failing.add("save");
      expect(unwrapErr(await h.service.abandon(SESSION_ID, "Stop"))).toMatchObject({ code: "store_error" });
      h.store.failing.add("load");
      expect(unwrapErr(await h.service.abandon(SESSION_ID, "Stop"))).toMatchObject({ code: "store_error" });
    });
  });
});
