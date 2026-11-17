import { describeError, type AudioClip, type PracticeError, type PracticeService, type SpeechServices } from "@cyai/core";
import {
  answerSchema,
  describeIssues,
  speakSchema,
  startPracticeSchema,
  type AppInfo,
  type ErrorBody,
  type Result,
  type Transcription,
} from "@cyai/spec";
import type { z } from "zod";

export interface ApiRequest {
  readonly method: string;
  /** Path below `/api`, without the query string, e.g. `/sessions/<id>/answer`. */
  readonly path: string;
  readonly body: unknown;
  /** The uploaded recording, for `POST /transcribe`. */
  readonly audio?: AudioClip;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
  /** Sent instead of `body` when present. */
  readonly audio?: AudioClip;
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

export const NO_TRANSCRIBER = "No speech-to-text server is configured; the browser transcribes instead.";
export const NO_SPEAKER = "No text-to-speech server is configured; the browser speaks instead.";

function modelFailure(message: string): ApiResponse {
  return failure(502, message);
}

/** Speech-to-text and the interviewer's voice, each answered with 503 when not configured. */
async function speechRoute(speech: SpeechServices, path: string, request: ApiRequest): Promise<ApiResponse> {
  if (path === "/transcribe") {
    if (speech.transcriber === undefined) {
      return failure(503, NO_TRANSCRIBER);
    }
    if (request.audio === undefined) {
      return failure(415, "Send the recording as audio/webm, audio/ogg, audio/mp4 or audio/wav.");
    }
    const text = await speech.transcriber.transcribe(request.audio);
    if (!text.ok) {
      return modelFailure(text.error.message);
    }
    const body: Transcription = { text: text.value };
    return { status: 200, body };
  }
  const { speaker } = speech;
  if (speaker === undefined) {
    return failure(503, NO_SPEAKER);
  }
  return parsed(speakSchema, request.body, async ({ text }) => {
    const audio = await speaker.speak(text);
    return audio.ok ? { status: 200, body: undefined, audio: audio.value } : modelFailure(audio.error.message);
  });
}

/** Routes one API call to the practice service. Transport-free so it can be tested without sockets. */
export function createApi(
  service: PracticeService,
  info: Omit<AppInfo, "voice">,
  speech: SpeechServices = {},
): (request: ApiRequest) => Promise<ApiResponse> {
  const appInfo: AppInfo = {
    ...info,
    voice: {
      transcription: speech.transcriber === undefined ? "browser" : "whisper",
      voice: speech.speaker === undefined ? "browser" : "endpoint",
    },
  };
  return async (request) => {
    const { method, path, body } = request;
    if (method === "POST" && (path === "/transcribe" || path === "/speak")) {
      return speechRoute(speech, path, request);
    }
    if (method === "GET" && path === "/info") {
      return { status: 200, body: appInfo };
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
        return parsed(answerSchema, body, ({ answer, speech: timing }) => served(service.answer(sessionId, answer, timing)));
      }
      if (method === "POST" && action === "/abandon") {
        return served(service.abandon(sessionId, ABANDON_REASON));
      }
    }
    return failure(404, `No API route for ${method} /api${path}`);
  };
}
