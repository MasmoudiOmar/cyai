import { err, ok, type Result, type SessionRecord } from "@cyai/spec";

import type { SessionStore, StoreError } from "../ports/index.js";

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
