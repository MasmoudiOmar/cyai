import { aiTrainerInterview, at, evaluation, SESSION_ID, unwrap, unwrapErr } from "@cyai/fixtures";
import type { Session } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import { begin } from "../interview/flow.js";
import { answerQuestion } from "../session/machine.js";
import { drive, events, fixedIds } from "../test-support/drive.js";
import {
  evaluationJson,
  fixtureCatalog,
  fixtureContext,
  manualClock,
  modelError,
  questionJson,
  scriptedModel,
  type ManualClock,
  type ScriptedModel,
  type ScriptedReply,
} from "../test-support/interview.js";
import { memoryStore, type MemoryStore } from "../test-support/store.js";
import { createPracticeService, type PracticeService } from "./practice.js";
import { candidateFrom } from "./repository.js";

const START = { interviewId: aiTrainerInterview.id, resume: "Annotator.", jobDescription: "  " };

interface Setup {
  readonly service: PracticeService;
  readonly store: MemoryStore;
  readonly clock: ManualClock;
  readonly model: ScriptedModel;
}

function setup(replies: readonly ScriptedReply[] = []): Setup {
  const store = memoryStore();
  const clock = manualClock(0);
  const model = scriptedModel(replies);
  const service = createPracticeService({ catalog: fixtureCatalog(), store, clock, ids: fixedIds, model });
  return { service, store, clock, model };
}

function stored(store: MemoryStore): Session | undefined {
  return store.records.get(SESSION_ID)?.session;
}

function put(store: MemoryStore, session: Session): void {
  store.records.set(session.id, { session, candidate: {} });
}

describe("practice service", () => {
  it("lists interviews and sessions", async () => {
    const { service, store } = setup();
    expect(service.listInterviews().map((item) => item.id)).toEqual([aiTrainerInterview.id]);
    unwrap(await service.start(START));
    expect(unwrap(await service.listSessions())).toMatchObject([{ sessionId: SESSION_ID, status: "awaiting_answer" }]);
    store.failing.add("list");
    expect(unwrapErr(await service.listSessions())).toMatchObject({ code: "store_error" });
  });

  it("runs an interview from the first question to the scored result", async () => {
    const { service, store, clock } = setup([evaluationJson(evaluation(4)), questionJson("Which dataset?"), evaluationJson(evaluation(3))]);
    expect(unwrap(await service.start(START))).toEqual({
      kind: "question",
      sessionId: SESSION_ID,
      interviewId: "ai-trainer-generalist",
      role: "AI Trainer",
      number: 1,
      maxQuestions: 2,
      text: "Tell me about a time you followed a guideline you disagreed with.",
      followUp: false,
      prepSeconds: 0,
      softSeconds: 120,
      hardSeconds: 180,
      turnTaking: { answer: "typed", endOfTurn: "submit" },
    });
    expect(store.records.get(SESSION_ID)?.candidate).toEqual({ resume: "Annotator." });

    clock.set(60);
    expect(unwrap(await service.answer(SESSION_ID, "I escalated."))).toMatchObject({ kind: "question", number: 2, text: "Which dataset?" });
    clock.set(120);
    const result = unwrap(await service.answer(SESSION_ID, "Radiology."));
    expect(result).toMatchObject({
      kind: "completed",
      role: "AI Trainer",
      passThreshold: 3.5,
      criteria: [
        { id: "structure", label: "Structure" },
        { id: "relevance", label: "Relevance" },
      ],
      scorecard: { overall: 3.5, passed: true },
    });
    expect(stored(store)?.status).toBe("completed");
    expect(unwrap(await service.resume(SESSION_ID))).toEqual(result);
  });

  it("keeps the question open when the model fails, so the answer can be retried", async () => {
    const { service, store } = setup([modelError("overloaded"), evaluationJson(evaluation(4)), questionJson("Next?")]);
    unwrap(await service.start(START));
    expect(unwrapErr(await service.answer(SESSION_ID, "Answer."))).toMatchObject({ code: "model_error" });
    expect(stored(store)?.status).toBe("awaiting_answer");
    expect(unwrap(await service.answer(SESSION_ID, "Answer."))).toMatchObject({ kind: "question", number: 2 });
  });

  it("rejects answers to unknown or finished sessions", async () => {
    const { service } = setup();
    expect(unwrapErr(await service.answer(SESSION_ID, "Hi"))).toMatchObject({ code: "store_error", reason: "not_found" });
    unwrap(await service.start(START));
    unwrap(await service.abandon(SESSION_ID, "Left"));
    expect(unwrapErr(await service.answer(SESSION_ID, "Hi"))).toEqual({
      code: "wrong_status",
      sessionId: SESSION_ID,
      expected: "awaiting_answer",
      actual: "abandoned",
    });
  });

  it("reports unknown interviews and storage failures when starting", async () => {
    const { service, store } = setup();
    expect(unwrapErr(await service.start({ interviewId: "nope" }))).toMatchObject({ code: "unknown_template" });
    store.failing.add("save");
    expect(unwrapErr(await service.start(START))).toMatchObject({ code: "store_error" });
  });

  describe("resume", () => {
    it("re-issues the open question and reports stopped sessions", async () => {
      const { service } = setup();
      const question = unwrap(await service.start(START));
      expect(unwrap(await service.resume(SESSION_ID))).toEqual(question);
      unwrap(await service.abandon(SESSION_ID, "Had to leave"));
      expect(unwrap(await service.resume(SESSION_ID))).toEqual({
        kind: "abandoned",
        sessionId: SESSION_ID,
        interviewId: "ai-trainer-generalist",
        role: "AI Trainer",
        reason: "Had to leave",
      });
    });

    it("asks the next question of a session left between turns", async () => {
      const { service, store } = setup();
      put(store, unwrap(begin(fixtureContext(), { clock: manualClock(0), ids: fixedIds })));
      expect(unwrap(await service.resume(SESSION_ID))).toMatchObject({ kind: "question", number: 1 });
      expect(stored(store)?.status).toBe("awaiting_answer");
    });

    it("has the model evaluate an answer that was left unevaluated", async () => {
      const { service, store, model, clock } = setup([evaluationJson(evaluation(4)), questionJson("Next?")]);
      const question = unwrap(await service.start(START));
      const session = stored(store);
      if (session?.status !== "awaiting_answer") {
        throw new Error(`Unexpected ${String(session?.status)}`);
      }
      put(store, unwrap(answerQuestion(session, "Answer.", at(30))));
      clock.set(60);
      expect(unwrap(await service.resume(question.sessionId))).toMatchObject({ kind: "question", number: 2, text: "Next?" });
      expect(model.requests).toHaveLength(2);
    });

    it("rejects sessions that cannot be resumed", async () => {
      const { service, store } = setup();
      put(store, drive());
      expect(unwrapErr(await service.resume(SESSION_ID))).toMatchObject({ code: "wrong_status", actual: "created" });
      put(store, drive(events.start(0), events.ask(1), events.answer(2), events.evaluate(evaluation(4)), events.finish(3)));
      expect(unwrapErr(await service.resume(SESSION_ID))).toMatchObject({ code: "wrong_status", actual: "scoring" });
    });

    it("reports sessions whose interview is no longer installed", async () => {
      const { service, store } = setup();
      put(store, { ...drive(), interviewId: "retired" });
      expect(unwrapErr(await service.resume(SESSION_ID))).toMatchObject({ code: "unknown_template", id: "retired" });
    });
  });

  describe("abandon", () => {
    it("stops an active session once", async () => {
      const { service, store } = setup();
      expect(unwrapErr(await service.abandon(SESSION_ID, "Left"))).toMatchObject({ code: "store_error", reason: "not_found" });
      unwrap(await service.start(START));
      expect(unwrap(await service.abandon(SESSION_ID, "Left"))).toMatchObject({ kind: "abandoned", reason: "Left" });
      expect(stored(store)).toMatchObject({ status: "abandoned", reason: "Left" });
      expect(unwrapErr(await service.abandon(SESSION_ID, "Again"))).toMatchObject({ code: "wrong_status", actual: "abandoned" });
    });

    it("reports a clock that runs backwards and storage failures", async () => {
      const { service, store, clock } = setup();
      clock.set(10);
      unwrap(await service.start(START));
      clock.set(0);
      expect(unwrapErr(await service.abandon(SESSION_ID, "Left"))).toMatchObject({ code: "clock_skew" });
      clock.set(20);
      store.failing.add("save");
      expect(unwrapErr(await service.abandon(SESSION_ID, "Left"))).toMatchObject({ code: "store_error" });
    });
  });

  it("drops blank candidate context", () => {
    expect(candidateFrom({ resume: " ", jobDescription: undefined })).toEqual({});
    expect(candidateFrom({ resume: " cv ", jobDescription: "jd" })).toEqual({ resume: "cv", jobDescription: "jd" });
  });
});
