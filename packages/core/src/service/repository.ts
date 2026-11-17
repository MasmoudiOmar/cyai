import {
  err,
  ok,
  type AbandonedView,
  type CandidateContext,
  type Result,
  type Session,
  type SessionIn,
  type SessionRecord,
  type SessionStatus,
  type SessionSummary,
} from "@cyai/spec";

import { resolveInterview, type CatalogError, type TemplateCatalog } from "../catalog/catalog.js";
import type { InterviewContext } from "../interview/context.js";
import type { Clock, SessionStore, StoreError } from "../ports/index.js";
import { summarizeSession } from "../report/summaries.js";
import type { TransitionError } from "../session/events.js";
import { isActive, isIn } from "../session/guards.js";
import { abandonSession } from "../session/machine.js";
import type { BindingMismatch } from "../shared/binding.js";
import { nowIso } from "../shared/time.js";
import { abandonedView } from "./views.js";

/** A session was found, but not in the state the operation needs. */
export interface WrongStatus {
  readonly code: "wrong_status";
  readonly sessionId: string;
  readonly expected: SessionStatus;
  readonly actual: SessionStatus;
}

export type RepositoryError = StoreError | CatalogError | BindingMismatch | WrongStatus;

/** A stored session together with the templates it was started from. */
export interface Loaded<S extends SessionStatus = SessionStatus> {
  readonly record: SessionRecord;
  readonly session: SessionIn<S>;
  readonly context: InterviewContext;
}

export interface RepositoryDeps {
  readonly catalog: TemplateCatalog;
  readonly store: SessionStore;
  readonly clock: Clock;
}

export interface SessionRepository {
  readonly load: (sessionId: string) => Promise<Result<Loaded, RepositoryError>>;
  readonly loadIn: <S extends SessionStatus>(sessionId: string, status: S) => Promise<Result<Loaded<S>, RepositoryError>>;
  /** Stores `session` under the candidate context of `record`. */
  readonly save: (record: SessionRecord, session: Session) => Promise<Result<SessionRecord, StoreError>>;
  readonly summaries: () => Promise<Result<readonly SessionSummary[], StoreError>>;
  /** Ends an active session early and stores it. */
  readonly abandon: (sessionId: string, reason: string) => Promise<Result<AbandonedView, RepositoryError | TransitionError>>;
}

export function wrongStatus(session: Session, expected: SessionStatus): WrongStatus {
  return { code: "wrong_status", sessionId: session.id, expected, actual: session.status };
}

/** Loads sessions with their interview context, so each caller does not have to. */
export function createSessionRepository(deps: RepositoryDeps): SessionRepository {
  const load = async (sessionId: string): Promise<Result<Loaded, RepositoryError>> => {
    const record = await deps.store.load(sessionId);
    if (!record.ok) {
      return record;
    }
    const context = resolveInterview(deps.catalog, record.value.session.interviewId, record.value.candidate);
    return context.ok ? ok({ record: record.value, session: record.value.session, context: context.value }) : context;
  };

  const save = (record: SessionRecord, session: Session): Promise<Result<SessionRecord, StoreError>> =>
    deps.store.save({ ...record, session });

  return {
    load,
    loadIn: async <S extends SessionStatus>(sessionId: string, status: S): Promise<Result<Loaded<S>, RepositoryError>> => {
      const loaded = await load(sessionId);
      if (!loaded.ok) {
        return loaded;
      }
      const { session } = loaded.value;
      return isIn(session, status) ? ok({ ...loaded.value, session }) : err(wrongStatus(session, status));
    },
    save,
    summaries: async (): Promise<Result<readonly SessionSummary[], StoreError>> => {
      const records = await deps.store.list();
      return records.ok ? ok(records.value.map(summarizeSession)) : records;
    },
    abandon: async (sessionId: string, reason: string): Promise<Result<AbandonedView, RepositoryError | TransitionError>> => {
      const loaded = await load(sessionId);
      if (!loaded.ok) {
        return loaded;
      }
      const { record, session, context } = loaded.value;
      if (!isActive(session)) {
        return err(wrongStatus(session, "awaiting_answer"));
      }
      const abandoned = abandonSession(session, nowIso(deps.clock), reason);
      if (!abandoned.ok) {
        return abandoned;
      }
      const saved = await save(record, abandoned.value);
      return saved.ok ? ok(abandonedView(context, abandoned.value)) : saved;
    },
  };
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

/** Candidate context from optional, possibly blank, pasted text. */
export function candidateFrom(input: {
  readonly resume?: string | undefined;
  readonly jobDescription?: string | undefined;
}): CandidateContext {
  const resume = nonBlank(input.resume);
  const jobDescription = nonBlank(input.jobDescription);
  return {
    ...(resume === undefined ? {} : { resume }),
    ...(jobDescription === undefined ? {} : { jobDescription }),
  };
}
