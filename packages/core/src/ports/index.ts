import type { JsonSchema, Result, SessionRecord } from "@cyai/spec";

/** Source of the current time. Inject a fake in tests. */
export interface Clock {
  readonly now: () => Date;
}

/** Source of unique session identifiers (UUIDs). */
export interface IdGenerator {
  readonly next: () => string;
}

/** A request for structured output from a language model. */
export interface ModelRequest {
  readonly system: string;
  readonly user: string;
  readonly response: { readonly name: string; readonly schema: JsonSchema };
}

export type ModelFailure = "auth" | "rate_limited" | "refused" | "bad_request" | "unavailable" | "failed";

export interface ModelError {
  readonly code: "model_error";
  readonly reason: ModelFailure;
  readonly message: string;
}

/** Any model provider. Returns the raw text of a JSON response matching `request.response`. */
export interface TextModel {
  readonly generate: (request: ModelRequest) => Promise<Result<string, ModelError>>;
}

export interface StoreError {
  readonly code: "store_error";
  readonly reason: "not_found" | "corrupt" | "io";
  readonly message: string;
}

/** Persists session records. Implementations validate what they read. */
export interface SessionStore {
  readonly save: (record: SessionRecord) => Promise<Result<SessionRecord, StoreError>>;
  readonly load: (sessionId: string) => Promise<Result<SessionRecord, StoreError>>;
  readonly list: () => Promise<Result<readonly SessionRecord[], StoreError>>;
}
