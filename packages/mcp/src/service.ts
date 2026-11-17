import {
  abandonSession,
  advance,
  answerQuestion,
  begin,
  evaluationRequest,
  isActive,
  isIn,
  provideQuestion,
  resolveInterview,
  submitEvaluation,
  nowIso,
  type CatalogError,
  type Clock,
  type FlowError,
  type IdGenerator,
  type InterviewContext,
  type ModelRequest,
  type Progress,
  type SessionStore,
  type StoreError,
  type TemplateCatalog,
} from "@cyai/core";
import {
  err,
  ok,
  type CandidateContext,
  type EvaluatedTurn,
  type Result,
  type Scorecard,
  type Session,
  type SessionIn,
  type SessionRecord,
  type SessionStatus,
} from "@cyai/spec";

export interface ServiceDeps {
  readonly catalog: TemplateCatalog;
  readonly store: SessionStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface WrongStatus {
  readonly code: "wrong_status";
  readonly sessionId: string;
  readonly expected: SessionStatus;
  readonly actual: SessionStatus;
}

export type ServiceError = FlowError | StoreError | CatalogError | WrongStatus;

/** What the calling agent should do next. */
export type Reply =
  | {
      readonly kind: "question";
      readonly sessionId: string;
      readonly number: number;
      readonly text: string;
      readonly followUp: boolean;
      readonly prepSeconds: number;
      readonly softSeconds: number;
      readonly hardSeconds: number;
    }
  | { readonly kind: "write_question"; readonly sessionId: string; readonly request: ModelRequest }
  | { readonly kind: "evaluate"; readonly sessionId: string; readonly request: ModelRequest }
  | {
      readonly kind: "completed";
      readonly sessionId: string;
      readonly role: string;
      readonly scorecard: Scorecard;
      readonly turns: readonly EvaluatedTurn[];
    }
  | { readonly kind: "abandoned"; readonly sessionId: string; readonly reason: string };

export interface InterviewSummary {
  readonly id: string;
  readonly role: string;
  readonly profile: string;
  readonly format: string;
  readonly totalMinutes: number;
  readonly maxQuestions: number;
}

export interface SessionSummary {
  readonly sessionId: string;
  readonly interviewId: string;
  readonly status: SessionStatus;
  readonly createdAt: string;
  readonly overall?: number;
}

export interface StartInput {
  readonly interviewId: string;
  readonly resume?: string | undefined;
  readonly jobDescription?: string | undefined;
}

export type Served<T> = Promise<Result<T, ServiceError>>;

export interface InterviewService {
  readonly listInterviews: () => readonly InterviewSummary[];
  readonly listSessions: () => Served<readonly SessionSummary[]>;
  readonly start: (input: StartInput) => Served<Reply>;
  readonly provideQuestion: (sessionId: string, text: string) => Served<Reply>;
  readonly submitAnswer: (sessionId: string, answer: string) => Served<Reply>;
  readonly submitEvaluation: (sessionId: string, evaluation: unknown) => Served<Reply>;
  /** Re-issues the current instruction, e.g. after the agent lost context. */
  readonly resume: (sessionId: string) => Served<Reply>;
  readonly abandon: (sessionId: string, reason: string) => Served<Reply>;
}

interface Loaded<S extends SessionStatus> {
  readonly record: SessionRecord;
  readonly session: SessionIn<S>;
  readonly context: InterviewContext;
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function candidateFrom({ resume, jobDescription }: StartInput): CandidateContext {
  const cleanResume = nonBlank(resume);
  const cleanJobDescription = nonBlank(jobDescription);
  return {
    ...(cleanResume === undefined ? {} : { resume: cleanResume }),
    ...(cleanJobDescription === undefined ? {} : { jobDescription: cleanJobDescription }),
  };
}

function questionReply(context: InterviewContext, session: SessionIn<"awaiting_answer">): Reply {
  const { prepSeconds, answer } = context.profile.timing;
  return {
    kind: "question",
    sessionId: session.id,
    number: session.turns.length + 1,
    text: session.pending.text,
    followUp: session.pending.followUpOf !== undefined,
    prepSeconds,
    softSeconds: answer.softSeconds,
    hardSeconds: answer.hardSeconds,
  };
}

function progressReply(context: InterviewContext, progress: Progress): Reply {
  switch (progress.kind) {
    case "question":
      return questionReply(context, progress.session);
    case "needs_question":
      return { kind: "write_question", sessionId: progress.session.id, request: progress.instruction.request };
    case "completed":
      return {
        kind: "completed",
        sessionId: progress.session.id,
        role: context.interview.role,
        scorecard: progress.session.scorecard,
        turns: progress.session.turns,
      };
  }
}

/** Transport-independent interview operations for an agent acting as the interviewer. */
export function createInterviewService(deps: ServiceDeps): InterviewService {
  const now = (): string => nowIso(deps.clock);

  const save = async (record: SessionRecord, session: Session): Served<SessionRecord> =>
    deps.store.save({ ...record, session });

  const persist = async (loaded: Pick<Loaded<SessionStatus>, "record" | "context">, progress: Progress): Served<Reply> => {
    const saved = await save(loaded.record, progress.session);
    return saved.ok ? ok(progressReply(loaded.context, progress)) : saved;
  };

  const loadContext = async (sessionId: string): Served<Loaded<SessionStatus>> => {
    const record = await deps.store.load(sessionId);
    if (!record.ok) {
      return record;
    }
    const context = resolveInterview(deps.catalog, record.value.session.interviewId, record.value.candidate);
    return context.ok ? ok({ record: record.value, session: record.value.session, context: context.value }) : context;
  };

  const loadIn = async <S extends SessionStatus>(sessionId: string, status: S): Served<Loaded<S>> => {
    const loaded = await loadContext(sessionId);
    if (!loaded.ok) {
      return loaded;
    }
    const { session } = loaded.value;
    return isIn(session, status)
      ? ok({ ...loaded.value, session })
      : err({ code: "wrong_status", sessionId, expected: status, actual: session.status });
  };

  return {
    listInterviews: (): readonly InterviewSummary[] =>
      [...deps.catalog.interviews.values()].flatMap((interview) => {
        const profile = deps.catalog.profiles.get(interview.profileId);
        return profile === undefined
          ? []
          : [
              {
                id: interview.id,
                role: interview.role,
                profile: profile.name,
                format: profile.format,
                totalMinutes: profile.timing.totalMinutes,
                maxQuestions: profile.turnPolicy.maxQuestions,
              },
            ];
      }),

    listSessions: async (): Served<readonly SessionSummary[]> => {
      const records = await deps.store.list();
      return records.ok
        ? ok(
            records.value.map(({ session }) => ({
              sessionId: session.id,
              interviewId: session.interviewId,
              status: session.status,
              createdAt: session.createdAt,
              ...(isIn(session, "completed") ? { overall: session.scorecard.overall } : {}),
            })),
          )
        : records;
    },

    start: async (input: StartInput): Served<Reply> => {
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
      if (!progress.ok) {
        return progress;
      }
      return persist({ record: { session: session.value, candidate }, context: context.value }, progress.value);
    },

    provideQuestion: async (sessionId: string, text: string): Served<Reply> => {
      const loaded = await loadIn(sessionId, "awaiting_question");
      if (!loaded.ok) {
        return loaded;
      }
      const progress = provideQuestion(loaded.value.context, loaded.value.session, { text }, now());
      return progress.ok ? persist(loaded.value, progress.value) : progress;
    },

    submitAnswer: async (sessionId: string, answer: string): Served<Reply> => {
      const loaded = await loadIn(sessionId, "awaiting_answer");
      if (!loaded.ok) {
        return loaded;
      }
      const answered = answerQuestion(loaded.value.session, answer, now());
      if (!answered.ok) {
        return answered;
      }
      const saved = await save(loaded.value.record, answered.value);
      return saved.ok
        ? ok({ kind: "evaluate", sessionId, request: evaluationRequest(loaded.value.context, answered.value) })
        : saved;
    },

    submitEvaluation: async (sessionId: string, evaluation: unknown): Served<Reply> => {
      const loaded = await loadIn(sessionId, "awaiting_evaluation");
      if (!loaded.ok) {
        return loaded;
      }
      const progress = submitEvaluation(loaded.value.context, loaded.value.session, evaluation, now());
      return progress.ok ? persist(loaded.value, progress.value) : progress;
    },

    resume: async (sessionId: string): Served<Reply> => {
      const loaded = await loadContext(sessionId);
      if (!loaded.ok) {
        return loaded;
      }
      const { session, context } = loaded.value;
      switch (session.status) {
        case "awaiting_answer":
          return ok(questionReply(context, session));
        case "awaiting_evaluation":
          return ok({ kind: "evaluate", sessionId, request: evaluationRequest(context, session) });
        case "completed":
          return ok(progressReply(context, { kind: "completed", session }));
        case "abandoned":
          return ok({ kind: "abandoned", sessionId, reason: session.reason });
        case "awaiting_question": {
          const progress = advance(context, session, now());
          return progress.ok ? persist(loaded.value, progress.value) : progress;
        }
        case "created":
        case "scoring":
          return err({ code: "wrong_status", sessionId, expected: "awaiting_question", actual: session.status });
      }
    },

    abandon: async (sessionId: string, reason: string): Served<Reply> => {
      const loaded = await loadContext(sessionId);
      if (!loaded.ok) {
        return loaded;
      }
      const { session } = loaded.value;
      if (!isActive(session)) {
        return err({ code: "wrong_status", sessionId, expected: "awaiting_answer", actual: session.status });
      }
      const abandoned = abandonSession(session, now(), reason);
      if (!abandoned.ok) {
        return abandoned;
      }
      const saved = await save(loaded.value.record, abandoned.value);
      return saved.ok ? ok({ kind: "abandoned", sessionId, reason }) : saved;
    },
  };
}
