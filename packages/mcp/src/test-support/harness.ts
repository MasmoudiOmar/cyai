import type { TemplateCatalog } from "@cyai/core";
import { fixtureCatalog, memoryStore, type MemoryStore } from "@cyai/core/test-support";
import { EPOCH_MS, SESSION_ID } from "@cyai/fixtures";
import type { Session } from "@cyai/spec";

import { createInterviewService, type InterviewService, type Reply } from "../service.js";

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
export { fixtureCatalog, memoryStore, type MemoryStore, type StoreOperation } from "@cyai/core/test-support";

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
