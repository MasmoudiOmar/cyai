import {
  appInfoSchema,
  describeIssues,
  err,
  errorBodySchema,
  interviewSummarySchema,
  ok,
  practiceViewSchema,
  sessionSummarySchema,
  transcriptionSchema,
  type AppInfo,
  type InterviewSummary,
  type PracticeView,
  type Result,
  type SessionSummary,
  type SpeechMeasurement,
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
  readonly answer: (sessionId: string, answer: string, speech?: SpeechMeasurement) => ApiResult<PracticeView>;
  readonly abandon: (sessionId: string) => ApiResult<PracticeView>;
  /** Server-side speech-to-text (Whisper). */
  readonly transcribe: (audio: Blob) => ApiResult<string>;
  /** The interviewer's voice from the server's text-to-speech. */
  readonly speech: (text: string) => ApiResult<Blob>;
}

export const UNREACHABLE = "Cannot reach the cyai server. Is `cyai ui` still running?";

const interviewsSchema = z.array(interviewSummarySchema);
const sessionsSchema = z.array(sessionSummarySchema);

function requestInit(body: unknown): RequestInit {
  if (body instanceof Blob) {
    return { method: "POST", headers: { "content-type": body.type }, body };
  }
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
  /** The response when the server answered 2xx; otherwise the reason to show. */
  const request = async (path: string, body: unknown): ApiResult<Response> => {
    let response: Response;
    try {
      response = await fetchFn(`/api${path}`, requestInit(body));
    } catch {
      return err(UNREACHABLE);
    }
    if (response.ok) {
      return ok(response);
    }
    const json = await readJson(response);
    const failure = errorBodySchema.safeParse(json.ok ? json.value : undefined);
    return err(failure.success ? failure.data.error : `Request failed (HTTP ${String(response.status)}).`);
  };
  const call = async <T>(path: string, schema: z.ZodType<T>, body?: unknown): ApiResult<T> => {
    const response = await request(path, body);
    if (!response.ok) {
      return response;
    }
    const json = await readJson(response.value);
    if (!json.ok) {
      return json;
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
    answer: (sessionId, answer, speech) =>
      call(sessionPath(sessionId, "/answer"), practiceViewSchema, speech === undefined ? { answer } : { answer, speech }),
    abandon: (sessionId) => call(sessionPath(sessionId, "/abandon"), practiceViewSchema, {}),
    transcribe: async (audio): ApiResult<string> => {
      const transcription = await call("/transcribe", transcriptionSchema, audio);
      return transcription.ok ? ok(transcription.value.text) : transcription;
    },
    speech: async (text): ApiResult<Blob> => {
      const response = await request("/speak", { text });
      if (!response.ok) {
        return response;
      }
      try {
        return ok(await response.value.blob());
      } catch {
        return err(UNREACHABLE);
      }
    },
  };
}
