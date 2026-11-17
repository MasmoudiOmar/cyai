import {
  err,
  ok,
  questionResponseFormat,
  type AskedQuestion,
  type IsoDateTime,
  type ResponseFormat,
  type Result,
  type SessionIn,
} from "@cyai/spec";

import type { Clock, IdGenerator, ModelRequest } from "../ports/index.js";
import { scoreSession, type ScoringError } from "../scoring/score-session.js";
import { validateEvaluation, type EvaluationError } from "../scoring/validate-evaluation.js";
import { createSession } from "../session/create.js";
import type { TransitionError } from "../session/events.js";
import { askQuestion, completeSession, finishSession, recordEvaluation, startSession } from "../session/machine.js";
import type { BindingMismatch } from "../shared/binding.js";
import { nowIso } from "../shared/time.js";
import type { InterviewContext } from "./context.js";
import { planNext, type GenerateInstruction, type QuestionToAsk } from "./plan.js";
import { evaluationFormat, evaluationRequest as buildEvaluationRequest } from "./prompts.js";

export interface InvalidResponse {
  readonly code: "invalid_response";
  readonly response: string;
  readonly message: string;
}

export type FlowError =
  | BindingMismatch
  | TransitionError
  | EvaluationError
  | ScoringError
  | InvalidResponse
  | { readonly code: "no_question_expected" };

/** Where the interview stands after a step. */
export type Progress =
  | { readonly kind: "question"; readonly session: SessionIn<"awaiting_answer"> }
  | {
      readonly kind: "needs_question";
      readonly session: SessionIn<"awaiting_question">;
      readonly instruction: GenerateInstruction;
    }
  | { readonly kind: "completed"; readonly session: SessionIn<"completed"> };

/** Progress once a question has been supplied: never `needs_question`. */
export type SettledProgress = Exclude<Progress, { kind: "needs_question" }>;

type Flow<T> = Result<T, FlowError>;

export interface BeginDeps {
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

function parseResponse<T>(format: ResponseFormat<T>, raw: unknown): Flow<T> {
  const parsed = format.parse(raw);
  return parsed.ok ? parsed : err({ code: "invalid_response", response: format.name, message: parsed.error });
}

function asked({ questionId, text, followUpOf }: QuestionToAsk, askedAt: IsoDateTime): AskedQuestion {
  return { questionId, text, askedAt, ...(followUpOf === undefined ? {} : { followUpOf }) };
}

function putQuestion(
  session: SessionIn<"awaiting_question">,
  question: QuestionToAsk,
  now: IsoDateTime,
): Flow<SettledProgress> {
  const next = askQuestion(session, asked(question, now));
  return next.ok ? ok({ kind: "question", session: next.value }) : next;
}

/** Ends the interview and scores it. */
export function conclude(
  context: InterviewContext,
  session: SessionIn<"awaiting_question">,
  now: IsoDateTime,
): Flow<SettledProgress> {
  const scoring = finishSession(session, now);
  if (!scoring.ok) {
    return scoring;
  }
  const scorecard = scoreSession(scoring.value, context.rubric);
  if (!scorecard.ok) {
    return scorecard;
  }
  return ok({ kind: "completed", session: completeSession(scoring.value, scorecard.value) });
}

/** Creates and starts a session for `context`. */
export function begin(context: InterviewContext, { clock, ids }: BeginDeps): Flow<SessionIn<"awaiting_question">> {
  const created = createSession(context, { clock, ids });
  return created.ok ? startSession(created.value, nowIso(clock)) : created;
}

/** Asks the next fixed question, requests a generated one, or concludes. */
export function advance(
  context: InterviewContext,
  session: SessionIn<"awaiting_question">,
  now: IsoDateTime,
): Flow<Progress> {
  const plan = planNext(context, session, now);
  if (!plan.ok) {
    return plan;
  }
  const instruction = plan.value;
  switch (instruction.kind) {
    case "ask":
      return putQuestion(session, instruction.question, now);
    case "generate":
      return ok({ kind: "needs_question", session, instruction });
    case "finish":
      return conclude(context, session, now);
  }
}

/** Supplies a generated question (`raw` must match `questionResponseFormat`). */
export function provideQuestion(
  context: InterviewContext,
  session: SessionIn<"awaiting_question">,
  raw: unknown,
  now: IsoDateTime,
): Flow<SettledProgress> {
  const progress = advance(context, session, now);
  if (!progress.ok) {
    return progress;
  }
  const next = progress.value;
  switch (next.kind) {
    case "question":
      return err({ code: "no_question_expected" });
    case "completed":
      return ok(next);
    case "needs_question": {
      const draft = parseResponse(questionResponseFormat, raw);
      return draft.ok ? putQuestion(next.session, { ...next.instruction, text: draft.value.text }, now) : draft;
    }
  }
}

/** Prompt for evaluating the answered turn. */
export function evaluationRequest(
  context: InterviewContext,
  session: SessionIn<"awaiting_evaluation">,
): ModelRequest {
  return buildEvaluationRequest(context, session.answered);
}

/** Records an evaluation (`raw` must match `evaluationFormat`) and advances the interview. */
export function submitEvaluation(
  context: InterviewContext,
  session: SessionIn<"awaiting_evaluation">,
  raw: unknown,
  now: IsoDateTime,
): Flow<Progress> {
  const evaluation = parseResponse(evaluationFormat(context), raw);
  if (!evaluation.ok) {
    return evaluation;
  }
  const valid = validateEvaluation(evaluation.value, context.rubric);
  if (!valid.ok) {
    return valid;
  }
  return advance(context, recordEvaluation(session, valid.value), now);
}
