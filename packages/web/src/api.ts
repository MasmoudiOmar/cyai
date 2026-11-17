import {
  appInfoSchema,
  describeIssues,
  err,
  errorBodySchema,
  interviewSummarySchema,
  ok,
  practiceViewSchema,
  sessionSummarySchema,
  type AppInfo,
  type InterviewSummary,
  type PracticeView,
  type Result,
  type SessionSummary,
  type StartPractice,
} from "@cyai/spec";
import { z } from "zod";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Every call resolves to a value or a sentence the page can show as is. */
export type ApiResult<T> = Promise<Result<T, string>>;

export interface ApiClient {
  readonly info: () => ApiResult<AppInfo>;
  readonly interviews: () => ApiResult<readonly InterviewSummary[]>;
  readonly sessions: () => ApiResult<readonly SessionSummary[]>;
  readonly start: (input: StartPractice) => ApiResult<PracticeView>;
  readonly session: (sessionId: string) => ApiResult<PracticeView>;
  readonly answer: (sessionId: string, answer: string) => ApiResult<PracticeView>;
  readonly abandon: (sessionId: string) => ApiResult<PracticeView>;
}

export const UNREACHABLE = "Cannot reach the cyai server. Is `cyai ui` still running?";

const interviewsSchema = z.array(interviewSummarySchema);
const sessionsSchema = z.array(sessionSummarySchema);

function requestInit(body: unknown): RequestInit {
  return body === undefined
    ? { headers: { accept: "application/json" } }
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

async function readJson(response: Response): Promise<Result<unknown, string>> {
  try {
    const json: unknown = await response.json();
    return ok(json);
  } catch {
    return err(`The server sent an unreadable response (HTTP ${String(response.status)}).`);
  }
}

/** A typed client for the local practice API. Responses are validated, never trusted. */
export function createApiClient(fetchFn: Fetch = (input, init) => fetch(input, init)): ApiClient {
  const call = async <T>(path: string, schema: z.ZodType<T>, body?: unknown): ApiResult<T> => {
    let response: Response;
    try {
      response = await fetchFn(`/api${path}`, requestInit(body));
    } catch {
      return err(UNREACHABLE);
    }
    const json = await readJson(response);
    if (!json.ok) {
      return json;
    }
    if (!response.ok) {
      const failure = errorBodySchema.safeParse(json.value);
      return err(failure.success ? failure.data.error : `Request failed (HTTP ${String(response.status)}).`);
    }
    const parsed = schema.safeParse(json.value);
    return parsed.success ? ok(parsed.data) : err(`Unexpected response from the server: ${describeIssues(parsed.error)}`);
  };
  const sessionPath = (sessionId: string, action = ""): string => `/sessions/${encodeURIComponent(sessionId)}${action}`;

  return {
    info: () => call("/info", appInfoSchema),
    interviews: () => call("/interviews", interviewsSchema),
    sessions: () => call("/sessions", sessionsSchema),
    start: (input) => call("/sessions", practiceViewSchema, input),
    session: (sessionId) => call(sessionPath(sessionId), practiceViewSchema),
    answer: (sessionId, answer) => call(sessionPath(sessionId, "/answer"), practiceViewSchema, { answer }),
    abandon: (sessionId) => call(sessionPath(sessionId, "/abandon"), practiceViewSchema, {}),
  };
}
