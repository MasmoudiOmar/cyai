import { buildCatalog, type SessionStore, type StoreError, type TemplateCatalog } from "@cyai/core";
import { aiTrainerInterview, EPOCH_MS, genericProfile, SESSION_ID, starRubric, unwrap } from "@cyai/fixtures";
import { err, ok, type Result, type Session, type SessionRecord } from "@cyai/spec";

import { createInterviewService, type InterviewService, type Reply } from "../service.js";

/** Operations a memory store can be told to fail. */
export type StoreOperation = "save" | "load" | "list";

export interface MemoryStore extends SessionStore {
  readonly records: Map<string, SessionRecord>;
  readonly failing: Set<StoreOperation>;
}

const STORE_FAILURE: StoreError = { code: "store_error", reason: "io", message: "disk full" };

export function memoryStore(): MemoryStore {
  const records = new Map<string, SessionRecord>();
  const failing = new Set<StoreOperation>();
  const guard = <T>(operation: StoreOperation, value: () => Result<T, StoreError>): Promise<Result<T, StoreError>> =>
    Promise.resolve(failing.has(operation) ? err(STORE_FAILURE) : value());
  return {
    records,
    failing,
    save: (record) =>
      guard("save", () => {
        records.set(record.session.id, record);
        return ok(record);
      }),
    load: (sessionId) =>
      guard("load", () => {
        const record = records.get(sessionId);
        return record === undefined
          ? err({ code: "store_error", reason: "not_found", message: `No session ${sessionId}` })
          : ok(record);
      }),
    list: () => guard("list", () => ok([...records.values()])),
  };
}

export function fixtureCatalog(): TemplateCatalog {
  const catalog = unwrap(buildCatalog({ profiles: [genericProfile], rubrics: [starRubric], interviews: [aiTrainerInterview] }));
  return catalog;
}

export interface Harness {
  readonly service: InterviewService;
  readonly store: MemoryStore;
  /** Moves the clock to `seconds` after the fixture epoch. */
  readonly at: (seconds: number) => void;
  /** Queues clock readings consumed before falling back to the current time. */
  readonly readings: number[];
}

export function harness(catalog: TemplateCatalog = fixtureCatalog(), store: MemoryStore = memoryStore()): Harness {
  let seconds = 0;
  const readings: number[] = [];
  const service = createInterviewService({
    catalog,
    store,
    clock: { now: (): Date => new Date(EPOCH_MS + (readings.shift() ?? seconds) * 1000) },
    ids: { next: () => SESSION_ID },
  });
  return {
    service,
    store,
    readings,
    at: (next): void => {
      seconds = next;
    },
  };
}

export { unwrap, unwrapErr } from "@cyai/fixtures";

function isKind<K extends Reply["kind"]>(reply: Reply, kind: K): reply is Extract<Reply, { kind: K }> {
  return reply.kind === kind;
}

export function expectKind<K extends Reply["kind"]>(reply: Reply, kind: K): Extract<Reply, { kind: K }> {
  if (!isKind(reply, kind)) {
    throw new Error(`Expected ${kind}, got ${reply.kind}`);
  }
  return reply;
}

/** The stored session for the fixture session id. */
export function storedSession(store: MemoryStore): Session {
  const record = store.records.get(SESSION_ID);
  if (record === undefined) {
    throw new Error("No stored session");
  }
  return record.session;
}
