import type { AudioClip } from "@cyai/core";
import { describe, expect, it } from "vitest";

import { createSpeech } from "./settings.js";
import {
  audioFileName,
  createSpeechEndpoint,
  createWhisperTranscriber,
  DEFAULT_SPEECH_VOICE,
  VERBATIM_PROMPT,
} from "./speech.js";

interface Sent {
  readonly url: string;
  readonly headers: Headers;
  readonly body: unknown;
}

/** A fetch that records each request and answers with `response`. */
function recording(response: () => Response): { readonly fetch: typeof globalThis.fetch; readonly sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    fetch: (input, init): Promise<Response> => {
      sent.push({ url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url, headers: new Headers(init?.headers), body: init?.body });
      return Promise.resolve(response());
    },
  };
}

const clip: AudioClip = { bytes: new Uint8Array([1, 2, 3]), type: "audio/webm;codecs=opus" };

function formOf(sent: Sent | undefined): FormData {
  const body = sent?.body;
  if (!(body instanceof FormData)) {
    throw new Error("Expected a multipart body");
  }
  return body;
}

describe("whisper transcriber", () => {
  it("asks for a verbatim English transcript and trims it", async () => {
    const { fetch, sent } = recording(() => Response.json({ text: "  Um, I fixed it. " }));
    const transcriber = createWhisperTranscriber({ baseUrl: "http://stt/v1/", apiKey: "k", fetch });
    expect(await transcriber.transcribe(clip)).toEqual({ ok: true, value: "Um, I fixed it." });
    expect(sent[0]?.url).toBe("http://stt/v1/audio/transcriptions");
    expect(sent[0]?.headers.get("authorization")).toBe("Bearer k");
    const form = formOf(sent[0]);
    expect(form.get("prompt")).toBe(VERBATIM_PROMPT);
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("language")).toBe("en");
    const file = form.get("file");
    expect(file instanceof File ? file.name : undefined).toBe("answer.webm");
  });

  it("reports unexpected bodies, error statuses and unreachable servers", async () => {
    const odd = createWhisperTranscriber({ baseUrl: "http://stt", model: "base.en", fetch: recording(() => Response.json({})).fetch });
    expect(await odd.transcribe(clip)).toMatchObject({ ok: false, error: { reason: "failed" } });

    const garbled = recording(() => new Response("not json"));
    expect(await createWhisperTranscriber({ baseUrl: "http://stt", fetch: garbled.fetch }).transcribe(clip)).toMatchObject({
      ok: false,
      error: { reason: "unavailable" },
    });

    const denied = recording(() => new Response("bad key", { status: 401 }));
    expect(await createWhisperTranscriber({ baseUrl: "http://stt", fetch: denied.fetch }).transcribe(clip)).toEqual({
      ok: false,
      error: { code: "model_error", reason: "auth", message: "401 bad key" },
    });

    const down: typeof globalThis.fetch = () => Promise.reject(new Error("connection refused"));
    expect(await createWhisperTranscriber({ baseUrl: "http://stt", fetch: down }).transcribe(clip)).toMatchObject({
      ok: false,
      error: { reason: "unavailable", message: "connection refused" },
    });
  });

  it("names uploads after their media type", () => {
    expect(audioFileName({ bytes: clip.bytes, type: "audio/ogg" })).toBe("answer.ogg");
    expect(audioFileName({ bytes: clip.bytes, type: "audio/wav" })).toBe("answer.wav");
    expect(audioFileName({ bytes: clip.bytes, type: "video/unknown" })).toBe("answer.webm");
  });
});

describe("speech endpoint", () => {
  it("returns the synthesised audio with its media type", async () => {
    const { fetch, sent } = recording(() => new Response(new Uint8Array([9, 8]), { headers: { "content-type": "audio/wav" } }));
    const spoken = await createSpeechEndpoint({ baseUrl: "http://tts/v1", model: "kokoro", voice: "af_heart", fetch }).speak("Hello.");
    expect(spoken).toEqual({ ok: true, value: { bytes: new Uint8Array([9, 8]), type: "audio/wav" } });
    expect(sent[0]?.url).toBe("http://tts/v1/audio/speech");
    expect(JSON.parse(String(sent[0]?.body))).toEqual({ model: "kokoro", voice: "af_heart", input: "Hello.", response_format: "mp3" });
  });

  it("defaults the model, voice and media type", async () => {
    const response = new Response(new Uint8Array([1]));
    response.headers.delete("content-type");
    const { fetch, sent } = recording(() => response);
    expect(await createSpeechEndpoint({ baseUrl: "http://tts", fetch }).speak("Hi")).toMatchObject({
      ok: true,
      value: { type: "audio/mpeg" },
    });
    expect(JSON.parse(String(sent[0]?.body))).toMatchObject({ model: "tts-1", voice: DEFAULT_SPEECH_VOICE });
  });

  it("reports failures", async () => {
    const { fetch } = recording(() => new Response("busy", { status: 503 }));
    expect(await createSpeechEndpoint({ baseUrl: "http://tts", fetch }).speak("Hi")).toMatchObject({
      ok: false,
      error: { reason: "unavailable" },
    });
    const dropped = new ReadableStream<Uint8Array>({
      start: (controller): void => {
        controller.error(new Error("connection reset"));
      },
    });
    const cut = recording(() => new Response(dropped));
    expect(await createSpeechEndpoint({ baseUrl: "http://tts", fetch: cut.fetch }).speak("Hi")).toMatchObject({
      ok: false,
      error: { reason: "unavailable", message: "connection reset" },
    });
  });
});

describe("createSpeech", () => {
  it("builds only the configured services", () => {
    expect(createSpeech({}, {})).toEqual({});
    const both = createSpeech({ transcription: { baseUrl: "http://stt" }, voice: { baseUrl: "http://tts" } }, { OPENAI_API_KEY: "" });
    expect(Object.keys(both).sort()).toEqual(["speaker", "transcriber"]);
  });

  it("prefers the speech key over the OpenAI key", async () => {
    const { fetch, sent } = recording(() => Response.json({ text: "hi" }));
    const keyed = (env: NodeJS.ProcessEnv): Promise<unknown> | undefined =>
      createSpeech({ transcription: { baseUrl: "http://stt" } }, env, fetch).transcriber?.transcribe(clip);
    await keyed({ CYAI_SPEECH_API_KEY: "speech", OPENAI_API_KEY: "openai" });
    await keyed({ OPENAI_API_KEY: "openai" });
    await keyed({});
    expect(sent.map((request) => request.headers.get("authorization"))).toEqual(["Bearer speech", "Bearer openai", null]);
  });
});
