import { aiTrainerInterview, EPOCH_MS, genericProfile, starRubric, unwrap } from "@cyai/fixtures";
import { err, ok, type CandidateContext, type TurnEvaluation } from "@cyai/spec";

import { buildCatalog, type TemplateCatalog } from "../catalog/catalog.js";
import type { InterviewContext } from "../interview/context.js";
import type { Clock, ModelError, ModelRequest, TextModel } from "../ports/index.js";

export const candidate: CandidateContext = {
  resume: "Five years annotating medical datasets.",
  jobDescription: "Review and rank model outputs against written guidelines.",
};

/** A context bound exactly like the fixtures, with optional overrides for negative tests. */
export function fixtureContext(overrides: Partial<InterviewContext> = {}): InterviewContext {
  return { interview: aiTrainerInterview, profile: genericProfile, rubric: starRubric, candidate, ...overrides };
}

/** A clock that stays at `seconds` after the epoch until moved. */
export interface ManualClock extends Clock {
  readonly set: (seconds: number) => void;
}

export function manualClock(seconds = 0): ManualClock {
  let current = seconds;
  return {
    now: (): Date => new Date(EPOCH_MS + current * 1000),
    set: (next): void => {
      current = next;
    },
  };
}

export type ScriptedReply = string | ModelError;

/** A model that returns scripted replies in order and records every request it receives. */
export interface ScriptedModel extends TextModel {
  readonly requests: readonly ModelRequest[];
}

export function scriptedModel(replies: readonly ScriptedReply[]): ScriptedModel {
  const queue = [...replies];
  const requests: ModelRequest[] = [];
  return {
    requests,
    generate: (request): ReturnType<TextModel["generate"]> => {
      requests.push(request);
      const reply = queue.shift() ?? modelError("No scripted reply left");
      return Promise.resolve(typeof reply === "string" ? ok(reply) : err(reply));
    },
  };
}

export function modelError(message: string): ModelError {
  return { code: "model_error", reason: "failed", message };
}

export function questionJson(text: string): string {
  return JSON.stringify({ text });
}

export function evaluationJson(evaluation: TurnEvaluation): string {
  return JSON.stringify(evaluation);
}

/** A catalog holding exactly the fixture templates. */
export function fixtureCatalog(): TemplateCatalog {
  return unwrap(buildCatalog({ profiles: [genericProfile], rubrics: [starRubric], interviews: [aiTrainerInterview] }));
}

