import {
  abandonedView,
  advance,
  answerQuestion,
  begin,
  candidateFrom,
  completedView,
  createSessionRepository,
  evaluationRequest,
  nowIso,
  provideQuestion,
  questionView,
  resolveInterview,
  submitEvaluation,
  summarizeInterviews,
  wrongStatus,
  type FlowError,
  type IdGenerator,
  type InterviewContext,
  type Loaded,
  type ModelRequest,
  type Progress,
  type RepositoryDeps,
  type RepositoryError,
} from "@cyai/core";
import {
  err,
  ok,
  type AbandonedView,
  type CandidateContext,
  type CompletedView,
  type InterviewSummary,
  type QuestionView,
  type Result,
  type SessionSummary,
  type StartPractice,
} from "@cyai/spec";

export interface ServiceDeps extends RepositoryDeps {
  readonly ids: IdGenerator;
}

export type ServiceError = FlowError | RepositoryError;

/** What the calling agent should do next. */
export type Reply =
  | QuestionView
  | { readonly kind: "write_question"; readonly sessionId: string; readonly request: ModelRequest }
  | { readonly kind: "evaluate"; readonly sessionId: string; readonly request: ModelRequest }
  | CompletedView
  | AbandonedView;

export type Served<T> = Promise<Result<T, ServiceError>>;

export interface InterviewService {
  readonly listInterviews: () => readonly InterviewSummary[];
  readonly listSessions: () => Served<readonly SessionSummary[]>;
  readonly start: (input: StartPractice) => Served<Reply>;
  readonly provideQuestion: (sessionId: string, text: string) => Served<Reply>;
  readonly submitAnswer: (sessionId: string, answer: string) => Served<Reply>;
  readonly submitEvaluation: (sessionId: string, evaluation: unknown) => Served<Reply>;
  /** Re-issues the current instruction, e.g. after the agent lost context. */
  readonly resume: (sessionId: string) => Served<Reply>;
  readonly abandon: (sessionId: string, reason: string) => Served<Reply>;
}

function progressReply(context: InterviewContext, progress: Progress): Reply {
  switch (progress.kind) {
    case "question":
      return questionView(context, progress.session);
    case "needs_question":
      return { kind: "write_question", sessionId: progress.session.id, request: progress.instruction.request };
    case "completed":
      return completedView(context, progress.session);
  }
}

/** Transport-independent interview operations for an agent acting as the interviewer. */
export function createInterviewService(deps: ServiceDeps): InterviewService {
  const repository = createSessionRepository(deps);
  const now = (): string => nowIso(deps.clock);

  const persist = async (context: InterviewContext, candidate: CandidateContext, progress: Progress): Served<Reply> => {
    const saved = await deps.store.save({ session: progress.session, candidate });
    return saved.ok ? ok(progressReply(context, progress)) : saved;
  };

  const continueWith = (loaded: Pick<Loaded, "record" | "context">, progress: Result<Progress, FlowError>): Served<Reply> =>
    progress.ok ? persist(loaded.context, loaded.record.candidate, progress.value) : Promise.resolve(progress);

  return {
    listInterviews: () => summarizeInterviews(deps.catalog),
    listSessions: repository.summaries,

    start: async (input: StartPractice): Served<Reply> => {
      const candidate = candidateFrom(input);
      const context = resolveInterview(deps.catalog, input.interviewId, candidate);
      if (!context.ok) {
        return context;
      }
      const session = begin(context.value, deps);
      if (!session.ok) {
        return session;
      }
      const progress = advance(context.value, session.value, now());
      return progress.ok ? persist(context.value, candidate, progress.value) : progress;
    },

    provideQuestion: async (sessionId: string, text: string): Served<Reply> => {
      const loaded = await repository.loadIn(sessionId, "awaiting_question");
      return loaded.ok
        ? continueWith(loaded.value, provideQuestion(loaded.value.context, loaded.value.session, { text }, now()))
        : loaded;
    },

    submitAnswer: async (sessionId: string, answer: string): Served<Reply> => {
      const loaded = await repository.loadIn(sessionId, "awaiting_answer");
      if (!loaded.ok) {
        return loaded;
      }
      const answered = answerQuestion(loaded.value.session, answer, now());
      if (!answered.ok) {
        return answered;
      }
      const saved = await repository.save(loaded.value.record, answered.value);
      return saved.ok
        ? ok({ kind: "evaluate", sessionId, request: evaluationRequest(loaded.value.context, answered.value) })
        : saved;
    },

    submitEvaluation: async (sessionId: string, evaluation: unknown): Served<Reply> => {
      const loaded = await repository.loadIn(sessionId, "awaiting_evaluation");
      return loaded.ok
        ? continueWith(loaded.value, submitEvaluation(loaded.value.context, loaded.value.session, evaluation, now()))
        : loaded;
    },

    resume: async (sessionId: string): Served<Reply> => {
      const loaded = await repository.load(sessionId);
      if (!loaded.ok) {
        return loaded;
      }
      const { session, context } = loaded.value;
      switch (session.status) {
        case "awaiting_answer":
          return ok(questionView(context, session));
        case "awaiting_evaluation":
          return ok({ kind: "evaluate", sessionId, request: evaluationRequest(context, session) });
        case "completed":
          return ok(completedView(context, session));
        case "abandoned":
          return ok(abandonedView(context, session));
        case "awaiting_question":
          return continueWith(loaded.value, advance(context, session, now()));
        case "created":
        case "scoring":
          return err(wrongStatus(session, "awaiting_question"));
      }
    },

    abandon: repository.abandon,
  };
}
