import type { ModelError, ModelFailure } from "@cyai/core";
import { describeIssues } from "@cyai/spec";
import type { z } from "zod";

/** Classifies an HTTP status (or none, for connection failures) into a model failure. */
export function failureForStatus(status: number | undefined): ModelFailure {
  if (status === undefined || status >= 500) {
    return "unavailable";
  }
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limited";
  }
  return status >= 400 ? "bad_request" : "failed";
}

export function modelError(reason: ModelFailure, message: string): ModelError {
  return { code: "model_error", reason, message };
}

/** A response body that does not have the expected shape. */
export function unexpectedBody(what: string, error: z.ZodError): ModelError {
  return modelError("failed", `Unexpected ${what}: ${describeIssues(error)}`);
}
