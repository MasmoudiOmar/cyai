import { describeError, type PracticeError, type PracticeService } from "@cyai/core";
import { answerSchema, describeIssues, startPracticeSchema, type AppInfo, type ErrorBody, type Result } from "@cyai/spec";
import type { z } from "zod";

export interface ApiRequest {
  readonly method: string;
  /** Path below `/api`, without the query string, e.g. `/sessions/<id>/answer`. */
  readonly path: string;
  readonly body: unknown;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

export const ABANDON_REASON = "Stopped in the web app.";

const SESSION_PATH = /^\/sessions\/([0-9a-f-]{36})(\/answer|\/abandon)?$/;

function failure(status: number, error: string): ApiResponse {
  const body: ErrorBody = { error };
  return { status, body };
}

/** HTTP status for an engine error: the caller's fault (4xx), the model's (502) or ours (500). */
export function statusFor(error: PracticeError): number {
  switch (error.code) {
    case "store_error":
      return error.reason === "not_found" ? 404 : 500;
    case "unknown_template":
      return 404;
    case "wrong_status":
    case "invalid_transition":
      return 409;
    case "model_error":
    case "invalid_response":
    case "unknown_criterion":
    case "duplicate_criterion":
      return 502;
    case "clock_skew":
    case "binding_mismatch":
    case "unscored_criterion":
    case "no_evaluated_turns":
    case "no_question_expected":
    case "duplicate_template":
    case "unknown_follow_up_target":
      return 500;
  }
}

async function served(result: Promise<Result<unknown, PracticeError>>): Promise<ApiResponse> {
  const outcome = await result;
  return outcome.ok ? { status: 200, body: outcome.value } : failure(statusFor(outcome.error), describeError(outcome.error));
}

function parsed<T>(schema: z.ZodType<T>, body: unknown, use: (value: T) => Promise<ApiResponse>): Promise<ApiResponse> {
  const result = schema.safeParse(body);
  return result.success ? use(result.data) : Promise.resolve(failure(400, describeIssues(result.error)));
}

/** Routes one API call to the practice service. Transport-free so it can be tested without sockets. */
export function createApi(service: PracticeService, info: AppInfo): (request: ApiRequest) => Promise<ApiResponse> {
  return async ({ method, path, body }) => {
    if (method === "GET" && path === "/info") {
      return { status: 200, body: info };
    }
    if (method === "GET" && path === "/interviews") {
      return { status: 200, body: service.listInterviews() };
    }
    if (path === "/sessions") {
      if (method === "GET") {
        return served(service.listSessions());
      }
      if (method === "POST") {
        return parsed(startPracticeSchema, body, (input) => served(service.start(input)));
      }
    }
    const match = SESSION_PATH.exec(path);
    const sessionId = match?.[1];
    if (sessionId !== undefined) {
      const action = match?.[2];
      if (method === "GET" && action === undefined) {
        return served(service.resume(sessionId));
      }
      if (method === "POST" && action === "/answer") {
        return parsed(answerSchema, body, ({ answer }) => served(service.answer(sessionId, answer)));
      }
      if (method === "POST" && action === "/abandon") {
        return served(service.abandon(sessionId, ABANDON_REASON));
      }
    }
    return failure(404, `No API route for ${method} /api${path}`);
  };
}
