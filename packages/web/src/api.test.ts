import { minuteOfSpeech, SESSION_ID, unwrap, unwrapErr } from "@cyai/fixtures";
import { describe, expect, it, vi } from "vitest";

import { createApiClient, UNREACHABLE, type Fetch } from "./api.js";
import { abandoned, completed, interview, question, session } from "./test-support/views.js";

interface Call {
  readonly input: string;
  readonly init: RequestInit | undefined;
}

function respond(status: number, body: string, calls: Call[] = []): Fetch {
  return (input, init) => {
    calls.push({ input, init });
    return Promise.resolve(new Response(body, { status, headers: { "content-type": "application/json" } }));
  };
}

describe("api client", () => {
  it("calls each endpoint and validates the response", async () => {
    const calls: Call[] = [];
    const client = (body: unknown): ReturnType<typeof createApiClient> => createApiClient(respond(200, JSON.stringify(body), calls));
    const info = { version: "1", model: "m", voice: { transcription: "browser", voice: "browser" } };
    expect(unwrap(await client(info).info())).toEqual(info);
    expect(unwrap(await client([interview]).interviews())).toEqual([interview]);
    expect(unwrap(await client([session]).sessions())).toEqual([session]);
    expect(unwrap(await client(question).start({ interviewId: interview.id }))).toEqual(question);
    expect(unwrap(await client(question).session(SESSION_ID))).toEqual(question);
    expect(unwrap(await client(completed).answer(SESSION_ID, "Hi"))).toEqual(completed);
    expect(unwrap(await client(abandoned).abandon(SESSION_ID))).toEqual(abandoned);
    expect(unwrap(await client(completed).answer(SESSION_ID, "Um", minuteOfSpeech))).toEqual(completed);
    expect(calls.map((call) => [call.input, call.init?.method ?? "GET", call.init?.body])).toEqual([
      ["/api/info", "GET", undefined],
      ["/api/interviews", "GET", undefined],
      ["/api/sessions", "GET", undefined],
      ["/api/sessions", "POST", '{"interviewId":"ai-trainer-generalist"}'],
      [`/api/sessions/${SESSION_ID}`, "GET", undefined],
      [`/api/sessions/${SESSION_ID}/answer`, "POST", '{"answer":"Hi"}'],
      [`/api/sessions/${SESSION_ID}/abandon`, "POST", "{}"],
      [`/api/sessions/${SESSION_ID}/answer`, "POST", JSON.stringify({ answer: "Um", speech: minuteOfSpeech })],
    ]);
  });

  it("uploads recordings for transcription and fetches the interviewer's voice", async () => {
    const calls: Call[] = [];
    const recording = new Blob([new Uint8Array([1, 2])], { type: "audio/webm" });
    expect(unwrap(await createApiClient(respond(200, '{"text":"Um, hi."}', calls)).transcribe(recording))).toBe("Um, hi.");
    expect(calls[0]?.init).toMatchObject({ method: "POST", headers: { "content-type": "audio/webm" }, body: recording });

    const voice: Fetch = (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(new Response(new Uint8Array([7]), { headers: { "content-type": "audio/mpeg" } }));
    };
    const audio = unwrap(await createApiClient(voice).speech("Hello."));
    expect([audio.type, audio.size]).toEqual(["audio/mpeg", 1]);
    expect(calls[1]).toMatchObject({ input: "/api/speak", init: { body: '{"text":"Hello."}' } });
  });

  it("reports speech failures", async () => {
    const recording = new Blob([], { type: "audio/webm" });
    const missing = createApiClient(respond(503, '{"error":"No speech-to-text server is configured."}'));
    expect(unwrapErr(await missing.transcribe(recording))).toBe("No speech-to-text server is configured.");
    expect(unwrapErr(await missing.speech("Hi"))).toBe("No speech-to-text server is configured.");
    const dropped = new ReadableStream<Uint8Array>({
      start: (controller): void => {
        controller.error(new Error("reset"));
      },
    });
    expect(unwrapErr(await createApiClient(() => Promise.resolve(new Response(dropped))).speech("Hi"))).toBe(UNREACHABLE);
  });

  it("explains failures in plain words", async () => {
    expect(unwrapErr(await createApiClient(() => Promise.reject(new Error("down"))).info())).toBe(UNREACHABLE);
    expect(unwrapErr(await createApiClient(respond(502, '{"error":"The model is overloaded."}')).info())).toBe(
      "The model is overloaded.",
    );
    expect(unwrapErr(await createApiClient(respond(500, "{}")).info())).toBe("Request failed (HTTP 500).");
    expect(unwrapErr(await createApiClient(respond(500, "<html>")).info())).toBe("Request failed (HTTP 500).");
    expect(unwrapErr(await createApiClient(respond(200, "<html>")).info())).toBe("The server sent an unreadable response (HTTP 200).");
    expect(unwrapErr(await createApiClient(respond(200, '{"version":1}')).info())).toMatch(/^Unexpected response from the server: /);
  });

  it("uses the browser fetch by default", async () => {
    vi.stubGlobal("fetch", respond(200, '{"version":"1","model":"m","voice":{"transcription":"whisper","voice":"endpoint"}}'));
    try {
      expect(unwrap(await createApiClient().info())).toMatchObject({ version: "1", model: "m" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
