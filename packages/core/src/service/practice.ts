import {
  err,
  ok,
  type CandidateContext,
  type InterviewSummary,
  type PracticeView,
  type Result,
  type SessionSummary,
  type SpeechMeasurement,
  type StartPractice,
} from "@cyai/spec";

import { resolveInterview } from "../catalog/catalog.js";
import type { InterviewContext } from "../interview/context.js";
import type { SettledProgress } from "../interview/flow.js";
import { answerRun, resumeRun, startRun, type RunnerDeps, type RunnerError } from "../interview/runner.js";
import type { StoreError } from "../ports/index.js";
import type { TransitionError } from "../session/events.js";
import { summarizeInterviews } from "../report/summaries.js";
import {
  candidateFrom,
  createSessionRepository,
  wrongStatus,
  type Loaded,
  type RepositoryDeps,
  type RepositoryError,
} from "./repository.js";
import { abandonedView, completedView, questionView } from "./views.js";

/** Standalone practice: a model is the interviewer. Used by the terminal and the web app. */
export interface PracticeServiceDeps extends RepositoryDeps, RunnerDeps {}

export type PracticeError = RunnerError | RepositoryError | TransitionError;

export type Practiced = Promise<Result<PracticeView, PracticeError>>;

export interface PracticeService {
  readonly listInterviews: () => readonly InterviewSummary[];
  readonly listSessions: () => Promise<Result<readonly SessionSummary[], StoreError>>;
  readonly start: (input: StartPractice) => Practiced;
  readonly answer: (sessionId: string, answer: string, speech?: SpeechMeasurement) => Practiced;
  /** The current view of a session, running any model step it was left waiting on. */
  readonly resume: (sessionId: string) => Practiced;
  readonly abandon: (sessionId: string, reason: string) => Practiced;
}

function settledView(context: InterviewContext, progress: SettledProgress): PracticeView {
  return progress.kind === "question" ? questionView(context, progress.session) : completedView(context, progress.session);
}

export function createPracticeService(deps: PracticeServiceDeps): PracticeService {
  const repository = createSessionRepository(deps);

  const persist = async (
    context: InterviewContext,
    candidate: CandidateContext,
    progress: Result<SettledProgress, RunnerError>,
  ): Practiced => {
    if (!progress.ok) {
      return progress;
    }
    const saved = await deps.store.save({ session: progress.value.session, candidate });
    return saved.ok ? ok(settledView(context, progress.value)) : saved;
  };

  const viewOf = async (loaded: Loaded): Practiced => {
    const { session, context } = loaded;
    switch (session.status) {
      case "awaiting_answer":
        return ok(questionView(context, session));
      case "completed":
        return ok(completedView(context, session));
      case "abandoned":
        return ok(abandonedView(context, session));
      case "awaiting_question":
      case "awaiting_evaluation":
        return persist(context, loaded.record.candidate, await resumeRun(context, deps, session));
      case "created":
      case "scoring":
        return err(wrongStatus(session, "awaiting_answer"));
    }
  };

  return {
    listInterviews: () => summarizeInterviews(deps.catalog),
    listSessions: repository.summaries,

    start: async (input: StartPractice): Practiced => {
      const candidate = candidateFrom(input);
      const context = resolveInterview(deps.catalog, input.interviewId, candidate);
      if (!context.ok) {
        return context;
      }
      return persist(context.value, candidate, await startRun(context.value, deps));
    },

    answer: async (sessionId: string, answer: string, speech?: SpeechMeasurement): Practiced => {
      const loaded = await repository.loadIn(sessionId, "awaiting_answer");
      if (!loaded.ok) {
        return loaded;
      }
      const { context, record, session } = loaded.value;
      return persist(context, record.candidate, await answerRun(context, deps, session, answer, speech));
    },

    resume: async (sessionId: string): Practiced => {
      const loaded = await repository.load(sessionId);
      return loaded.ok ? viewOf(loaded.value) : loaded;
    },

    abandon: repository.abandon,
  };
}
