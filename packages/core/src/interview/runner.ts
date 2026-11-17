import { err, ok, type Result, type SessionIn } from "@cyai/spec";

import type { ModelError, ModelRequest, TextModel } from "../ports/index.js";
import { answerQuestion } from "../session/machine.js";
import { nowIso } from "../shared/time.js";
import type { InterviewContext } from "./context.js";
import {
  advance,
  begin,
  evaluationRequest,
  provideQuestion,
  submitEvaluation,
  type BeginDeps,
  type FlowError,
  type Progress,
  type SettledProgress,
} from "./flow.js";

/** Standalone mode: a model writes questions and evaluations. */
export interface RunnerDeps extends BeginDeps {
  readonly model: TextModel;
}

export type RunnerError = FlowError | ModelError;

type Run = Promise<Result<SettledProgress, RunnerError>>;

async function generateJson(model: TextModel, request: ModelRequest): Promise<Result<unknown, RunnerError>> {
  const text = await model.generate(request);
  if (!text.ok) {
    return text;
  }
  try {
    const parsed: unknown = JSON.parse(text.value);
    return ok(parsed);
  } catch {
    return err({ code: "invalid_response", response: request.response.name, message: "Model output is not valid JSON" });
  }
}

async function settle(context: InterviewContext, deps: RunnerDeps, progress: Progress): Run {
  if (progress.kind !== "needs_question") {
    return ok(progress);
  }
  const raw = await generateJson(deps.model, progress.instruction.request);
  return raw.ok ? provideQuestion(context, progress.session, raw.value, nowIso(deps.clock)) : raw;
}

/** Starts an interview and returns the first question. */
export async function startRun(context: InterviewContext, deps: RunnerDeps): Run {
  const session = begin(context, deps);
  if (!session.ok) {
    return session;
  }
  const progress = advance(context, session.value, nowIso(deps.clock));
  return progress.ok ? settle(context, deps, progress.value) : progress;
}

/** Has the model evaluate the answered turn, then returns the next question or the result. */
async function evaluateRun(context: InterviewContext, deps: RunnerDeps, session: SessionIn<"awaiting_evaluation">): Run {
  const raw = await generateJson(deps.model, evaluationRequest(context, session));
  if (!raw.ok) {
    return raw;
  }
  const progress = submitEvaluation(context, session, raw.value, nowIso(deps.clock));
  return progress.ok ? settle(context, deps, progress.value) : progress;
}

/** Records the candidate's answer, has the model evaluate it, and returns the next question or the result. */
export async function answerRun(
  context: InterviewContext,
  deps: RunnerDeps,
  session: SessionIn<"awaiting_answer">,
  text: string,
): Run {
  const answered = answerQuestion(session, text, nowIso(deps.clock));
  return answered.ok ? evaluateRun(context, deps, answered.value) : answered;
}

/** Finishes a step that was interrupted between turns, e.g. a session started by an agent. */
export async function resumeRun(
  context: InterviewContext,
  deps: RunnerDeps,
  session: SessionIn<"awaiting_question" | "awaiting_evaluation">,
): Run {
  if (session.status === "awaiting_evaluation") {
    return evaluateRun(context, deps, session);
  }
  const progress = advance(context, session, nowIso(deps.clock));
  return progress.ok ? settle(context, deps, progress.value) : progress;
}
