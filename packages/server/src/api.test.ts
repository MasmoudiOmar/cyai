import { createPracticeService, type AudioClip, type PracticeError, type SpeechServices } from "@cyai/core";
import { evaluationJson, fixtureCatalog, fixedIds, manualClock, memoryStore, modelError, questionJson, scriptedModel, type ScriptedReply } from "@cyai/core/test-support";
import { at, evaluation, minuteOfSpeech, SESSION_ID } from "@cyai/fixtures";
import { err, ok } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import { ABANDON_REASON, createApi, NO_SPEAKER, NO_TRANSCRIBER, statusFor } from "./api.js";

const INFO = { version: "0.1.0", model: "claude-opus-5-5" };
const START = { interviewId: "ai-trainer-generalist", resume: "Annotator." };

function api(replies: readonly ScriptedReply[] = [], speech: SpeechServices = {}): { readonly call: ReturnType<typeof createApi>; readonly store: ReturnType<typeof memoryStore> } {
  const store = memoryStore();
  const service = createPracticeService({
    catalog: fixtureCatalog(),
    store,
    clock: manualClock(0),
    ids: fixedIds,
    model: scriptedModel(replies),
  });
  return { call: createApi(service, INFO, speech), store };
}

const get = (path: string): { readonly method: string; readonly path: string; readonly body: unknown } => ({ method: "GET", path, body: undefined });
const post = (path: string, body: unknown): { readonly method: string; readonly path: string; readonly body: unknown } => ({ method: "POST", path, body });

describe("practice API", () => {
  it("describes the app and lists interviews and sessions", async () => {
    const { call, store } = api();
    expect(await call(get("/info"))).toEqual({
      status: 200,
      body: { ...INFO, voice: { transcription: "browser", voice: "browser" } },
    });
    expect(await call(get("/interviews"))).toMatchObject({ status: 200, body: [{ id: "ai-trainer-generalist" }] });
    expect(await call(get("/sessions"))).toEqual({ status: 200, body: [] });
    store.failing.add("list");
    expect(await call(get("/sessions"))).toEqual({ status: 500, body: { error: "Session storage failed (io): disk full" } });
  });

  it("starts, answers, resumes and abandons a session", async () => {
    const { call } = api([evaluationJson(evaluation(4)), questionJson("Which dataset?")]);
    expect(await call(post("/sessions", START))).toMatchObject({ status: 200, body: { kind: "question", number: 1 } });
    expect(await call(get(`/sessions/${SESSION_ID}`))).toMatchObject({ status: 200, body: { kind: "question", number: 1 } });
    expect(await call(post(`/sessions/${SESSION_ID}/answer`, { answer: "I escalated.", speech: minuteOfSpeech }))).toMatchObject({
      status: 200,
      body: { kind: "question", number: 2, text: "Which dataset?" },
    });
    expect(await call(post(`/sessions/${SESSION_ID}/abandon`, {}))).toMatchObject({
      status: 200,
      body: { kind: "abandoned", reason: ABANDON_REASON },
    });
    expect(await call(post(`/sessions/${SESSION_ID}/abandon`, {}))).toMatchObject({ status: 409 });
  });

  it("rejects invalid requests", async () => {
    const { call } = api();
    expect(await call(post("/sessions", { interviewId: "Not An Id" }))).toMatchObject({ status: 400 });
    expect(await call(post("/sessions", { interviewId: "nope" }))).toEqual({ status: 404, body: { error: 'Unknown interview "nope".' } });
    expect(await call(post(`/sessions/${SESSION_ID}/answer`, { answer: 42 }))).toMatchObject({ status: 400 });
    expect(await call(post(`/sessions/${SESSION_ID}/answer`, { answer: "Hi", speech: { speechMs: -1 } }))).toMatchObject({
      status: 400,
    });
    expect(await call(get(`/sessions/${SESSION_ID}`))).toMatchObject({ status: 404 });
  });

  it("reports model failures as a bad gateway", async () => {
    const { call } = api([modelError("overloaded")]);
    await call(post("/sessions", START));
    expect(await call(post(`/sessions/${SESSION_ID}/answer`, { answer: "Hi" }))).toEqual({
      status: 502,
      body: { error: "The model request failed (failed): overloaded" },
    });
  });

  it.each([
    get("/nope"),
    { method: "DELETE", path: "/sessions", body: undefined },
    get(`/sessions/${SESSION_ID}/answer`),
    post(`/sessions/${SESSION_ID}`, {}),
    get("/sessions/not-a-uuid"),
  ])("answers 404 for %j", async (request) => {
    expect(await api().call(request)).toEqual({ status: 404, body: { error: `No API route for ${request.method} /api${request.path}` } });
  });
});

describe("speech API", () => {
  const recording: AudioClip = { bytes: new Uint8Array([1, 2]), type: "audio/webm" };
  const voice: AudioClip = { bytes: new Uint8Array([7]), type: "audio/mpeg" };
  const working: SpeechServices = {
    transcriber: { transcribe: (audio) => Promise.resolve(ok(`Um, ${String(audio.bytes.length)} bytes.`)) },
    speaker: { speak: () => Promise.resolve(ok(voice)) },
  };
  const failure = { code: "model_error", reason: "unavailable", message: "whisper is down" } as const;
  const broken: SpeechServices = {
    transcriber: { transcribe: () => Promise.resolve(err(failure)) },
    speaker: { speak: () => Promise.resolve(err(failure)) },
  };

  it("reports which speech services are configured", async () => {
    expect(await api([], working).call(get("/info"))).toMatchObject({
      body: { voice: { transcription: "whisper", voice: "endpoint" } },
    });
  });

  it("transcribes recordings and speaks interviewer lines", async () => {
    const { call } = api([], working);
    expect(await call({ ...post("/transcribe", undefined), audio: recording })).toEqual({
      status: 200,
      body: { text: "Um, 2 bytes." },
    });
    expect(await call(post("/speak", { text: "Tell me about yourself." }))).toEqual({ status: 200, body: undefined, audio: voice });
  });

  it("rejects missing recordings and invalid lines", async () => {
    const { call } = api([], working);
    expect(await call(post("/transcribe", {}))).toMatchObject({ status: 415 });
    expect(await call(post("/speak", { text: " " }))).toMatchObject({ status: 400 });
  });

  it("answers 503 when a service is not configured, so the browser takes over", async () => {
    const { call } = api();
    expect(await call({ ...post("/transcribe", undefined), audio: recording })).toEqual({
      status: 503,
      body: { error: NO_TRANSCRIBER },
    });
    expect(await call(post("/speak", { text: "Hi" }))).toEqual({ status: 503, body: { error: NO_SPEAKER } });
  });

  it("reports speech failures as a bad gateway", async () => {
    const { call } = api([], broken);
    expect(await call({ ...post("/transcribe", undefined), audio: recording })).toEqual({
      status: 502,
      body: { error: "whisper is down" },
    });
    expect(await call(post("/speak", { text: "Hi" }))).toEqual({ status: 502, body: { error: "whisper is down" } });
  });
});

describe("statusFor", () => {
  const cases: readonly [PracticeError, number][] = [
    [{ code: "store_error", reason: "not_found", message: "" }, 404],
    [{ code: "store_error", reason: "corrupt", message: "" }, 500],
    [{ code: "unknown_template", kind: "interview", id: "x" }, 404],
    [{ code: "wrong_status", sessionId: SESSION_ID, expected: "awaiting_answer", actual: "completed" }, 409],
    [{ code: "invalid_transition", from: "completed", event: "answer" }, 409],
    [{ code: "model_error", reason: "auth", message: "" }, 502],
    [{ code: "invalid_response", response: "r", message: "" }, 502],
    [{ code: "unknown_criterion", criterionId: "x" }, 502],
    [{ code: "duplicate_criterion", criterionId: "x" }, 502],
    [{ code: "clock_skew", earliest: at(1), received: at(0) }, 500],
    [{ code: "binding_mismatch", kind: "profile", expected: "a", received: "b" }, 500],
    [{ code: "unscored_criterion", criterionId: "x" }, 500],
    [{ code: "no_evaluated_turns" }, 500],
    [{ code: "no_question_expected" }, 500],
    [{ code: "duplicate_template", kind: "rubric", id: "x" }, 500],
    [{ code: "unknown_follow_up_target", followUpOf: 1, turnCount: 0 }, 500],
  ];

  it.each(cases)("maps %j", (error, status) => {
    expect(statusFor(error)).toBe(status);
  });
});
