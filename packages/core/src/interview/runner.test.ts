import { aiTrainerInterview, at, evaluation, genericProfile, minuteOfSpeech, spokenProfile } from "@cyai/fixtures";
import type { SessionIn } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import type { Clock } from "../ports/index.js";
import { fixedIds, unwrap, unwrapErr } from "../test-support/drive.js";
import {
  evaluationJson,
  fixtureContext,
  manualClock,
  modelError,
  questionJson,
  scriptedModel,
  type ManualClock,
  type ScriptedModel,
  type ScriptedReply,
} from "../test-support/interview.js";
import type { SettledProgress } from "./flow.js";
import { begin } from "./flow.js";
import { answerRun, resumeRun, startRun, type RunnerDeps } from "./runner.js";

const context = fixtureContext();

interface TestRunner extends RunnerDeps {
  readonly clock: ManualClock;
  readonly model: ScriptedModel;
}

function runnerWith(replies: readonly ScriptedReply[] = []): TestRunner {
  return { clock: manualClock(0), ids: fixedIds, model: scriptedModel(replies) };
}

function questionOf(progress: SettledProgress): SessionIn<"awaiting_answer"> {
  if (progress.kind !== "question") {
    throw new Error(`Expected a question, got ${progress.kind}`);
  }
  return progress.session;
}

async function firstQuestion(runner: RunnerDeps): Promise<SessionIn<"awaiting_answer">> {
  return questionOf(unwrap(await startRun(context, runner)));
}

describe("standalone runner", () => {
  it("runs a full interview with model-written questions and evaluations", async () => {
    const runner = runnerWith([
      evaluationJson(evaluation(4)),
      questionJson("Which dataset was hardest?"),
      evaluationJson(evaluation(3)),
    ]);
    const first = await firstQuestion(runner);
    expect(first.pending.questionId).toBe("q1");
    expect(runner.model.requests).toHaveLength(0);

    runner.clock.set(60);
    const second = questionOf(unwrap(await answerRun(context, runner, first, "I escalated, then complied.")));
    expect(second.pending).toMatchObject({ questionId: "gen-2", text: "Which dataset was hardest?" });

    runner.clock.set(120);
    expect(unwrap(await answerRun(context, runner, second, "The radiology set."))).toMatchObject({
      kind: "completed",
      session: { scorecard: { overall: 3.5 } },
    });
    expect(runner.model.requests.map((request) => request.response.name)).toEqual([
      "answer_evaluation",
      "interview_question",
      "answer_evaluation",
    ]);
  });

  it("measures delivery for spoken answers only", async () => {
    const spoken = fixtureContext({
      profile: spokenProfile,
      interview: { ...aiTrainerInterview, profileId: spokenProfile.id },
    });
    const replies = [evaluationJson(evaluation(4)), questionJson("And then?")];
    const spokenRunner = runnerWith(replies);
    const asked = questionOf(unwrap(await startRun(spoken, spokenRunner)));
    const next = questionOf(unwrap(await answerRun(spoken, spokenRunner, asked, "Um, I escalated.", minuteOfSpeech)));
    expect(next.turns[0]?.answer.delivery).toMatchObject({ words: 3, fillers: [{ word: "um", count: 1 }] });
    expect(next.turns[0]?.elapsedMs).toBe(63_700);
    expect(spokenRunner.model.requests[0]?.user).toContain("<delivery>");

    const typedRunner = runnerWith(replies);
    const typed = questionOf(unwrap(await answerRun(context, typedRunner, await firstQuestion(typedRunner), "Um.", minuteOfSpeech)));
    expect(typed.turns[0]?.answer.delivery).toBeUndefined();
  });

  it.each([
    ["a model error on evaluation", [modelError("down")], { code: "model_error", message: "down" }],
    ["non-JSON model output", ["not json"], { code: "invalid_response", message: "Model output is not valid JSON" }],
    ["an evaluation that fails validation", [JSON.stringify({ scores: [] })], { code: "invalid_response" }],
    ["a failed question generation", [evaluationJson(evaluation(4)), modelError("busy")], { code: "model_error" }],
  ] as const)("surfaces %s", async (_case, replies, expected) => {
    const runner = runnerWith(replies);
    expect(unwrapErr(await answerRun(context, runner, await firstQuestion(runner), "Answer"))).toMatchObject(expected);
  });

  it("rejects an answer timestamped before its question", async () => {
    const runner = runnerWith();
    const first = await firstQuestion(runner);
    runner.clock.set(-5);
    expect(unwrapErr(await answerRun(context, runner, first, "Answer"))).toMatchObject({ code: "clock_skew" });
  });

  it("refuses to start with an unbound profile", async () => {
    const unbound = fixtureContext({ profile: { ...genericProfile, id: "other" } });
    expect(unwrapErr(await startRun(unbound, runnerWith()))).toMatchObject({ code: "binding_mismatch" });
  });

  it("surfaces a failure to ask the first question", async () => {
    const readings = [0, 0, -1];
    const clock: Clock = { now: () => new Date(Date.parse(at(readings.shift() ?? 0))) };
    expect(unwrapErr(await startRun(context, { ...runnerWith(), clock }))).toMatchObject({ code: "clock_skew" });
  });

  it("reports a clock that runs backwards while resuming between turns", async () => {
    const session = unwrap(begin(context, { clock: manualClock(10), ids: fixedIds }));
    expect(unwrapErr(await resumeRun(context, runnerWith(), session))).toMatchObject({ code: "clock_skew" });
  });
});
