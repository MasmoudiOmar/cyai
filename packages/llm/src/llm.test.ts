import Anthropic from "@anthropic-ai/sdk";
import type { ModelRequest } from "@cyai/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAnthropicModel, DEFAULT_ANTHROPIC_MODEL } from "./anthropic.js";
import { failureForStatus } from "./failures.js";
import { createOpenAICompatibleModel, DEFAULT_OPENAI_COMPATIBLE_BASE_URL } from "./openai-compatible.js";

const request: ModelRequest = {
  system: "You are an interviewer.",
  user: "Ask one question.",
  response: { name: "interview_question", schema: { type: "object" } },
};

interface Captured {
  url: string;
  body: unknown;
  headers: Headers;
}

/** A fetch that records the request and answers with `status` and a JSON (or raw text) body. */
function fakeFetch(status: number, body: unknown, captured: Captured[] = []): typeof globalThis.fetch {
  return (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const rawBody = init?.body;
    captured.push({
      url,
      body: typeof rawBody === "string" ? JSON.parse(rawBody) : undefined,
      headers: new Headers(init?.headers),
    });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return Promise.resolve(new Response(text, { status, headers: { "content-type": "application/json" } }));
  };
}

const failingFetch: typeof globalThis.fetch = () => Promise.reject(new Error("connection refused"));

function anthropicMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: DEFAULT_ANTHROPIC_MODEL,
    content: [{ type: "text", text: '{"text":"Why this role?"}' }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 10, output_tokens: 5 },
    ...overrides,
  };
}

function anthropic(fetch: typeof globalThis.fetch): Anthropic {
  return new Anthropic({ apiKey: "test-key", fetch, maxRetries: 0 });
}

describe("failureForStatus", () => {
  it.each([
    [undefined, "unavailable"],
    [503, "unavailable"],
    [401, "auth"],
    [403, "auth"],
    [429, "rate_limited"],
    [400, "bad_request"],
    [302, "failed"],
  ] as const)("maps %s to %s", (status, expected) => {
    expect(failureForStatus(status)).toBe(expected);
  });
});

describe("Anthropic model", () => {
  it("requests structured JSON with refusal fallbacks and returns the text", async () => {
    const captured: Captured[] = [];
    const model = createAnthropicModel({ client: anthropic(fakeFetch(200, anthropicMessage(), captured)) });
    expect(await model.generate(request)).toEqual({ ok: true, value: '{"text":"Why this role?"}' });
    const [sent] = captured;
    expect(sent?.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(sent?.body).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema", schema: { type: "object" } } },
      system: request.system,
      messages: [{ role: "user", content: request.user }],
    });
  });

  it.each([
    ["a refusal", { stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: "Declined" } }, "refused", "Declined"],
    ["a refusal without details", { stop_reason: "refusal" }, "refused", "The model declined this request."],
    ["truncation", { stop_reason: "max_tokens" }, "failed", "The response was cut off at the token limit."],
    ["no text blocks", { content: [] }, "failed", "The response contained no text."],
  ] as const)("reports %s", async (_case, overrides, reason, message) => {
    const model = createAnthropicModel({ client: anthropic(fakeFetch(200, anthropicMessage(overrides))) });
    expect(await model.generate(request)).toEqual({ ok: false, error: { code: "model_error", reason, message } });
  });

  it("maps API errors by status", async () => {
    const body = { type: "error", error: { type: "rate_limit_error", message: "Slow down" } };
    const model = createAnthropicModel({ client: anthropic(fakeFetch(429, body)), model: "claude-haiku-5-5", effort: "low" });
    expect(await model.generate(request)).toMatchObject({ ok: false, error: { reason: "rate_limited" } });
  });

  it("maps connection failures to unavailable", async () => {
    const model = createAnthropicModel({ client: anthropic(failingFetch) });
    expect(await model.generate(request)).toMatchObject({ ok: false, error: { reason: "unavailable" } });
  });

  it("ignores non-text blocks such as thinking", async () => {
    const content = [{ type: "thinking", thinking: "", signature: "sig" }, { type: "text", text: "{}" }];
    const model = createAnthropicModel({ client: anthropic(fakeFetch(200, anthropicMessage({ content }))) });
    expect(await model.generate(request)).toEqual({ ok: true, value: "{}" });
  });

  it("reports unexpected failures that are not API errors", async () => {
    const model = createAnthropicModel({ client: anthropic(fakeFetch(200, "not json")) });
    expect(await model.generate(request)).toMatchObject({ ok: false, error: { code: "model_error" } });
  });

  describe("default client", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("reads credentials from the environment", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
      vi.stubEnv("ANTHROPIC_BASE_URL", "http://127.0.0.1:9");
      const result = await createAnthropicModel({ maxTokens: 10 }).generate(request);
      expect(result).toMatchObject({ ok: false, error: { reason: "unavailable" } });
    });
  });
});

describe("OpenAI-compatible model", () => {
  const completion = (choice: Record<string, unknown>): Record<string, unknown> => ({ choices: [choice] });

  it("posts a JSON-schema chat completion and returns the content", async () => {
    const captured: Captured[] = [];
    const model = createOpenAICompatibleModel({
      model: "llama3.2",
      apiKey: "secret",
      baseUrl: "http://localhost:1234/v1/",
      fetch: fakeFetch(200, completion({ finish_reason: "stop", message: { content: '{"text":"Hi"}' } }), captured),
    });
    expect(await model.generate(request)).toEqual({ ok: true, value: '{"text":"Hi"}' });
    const [sent] = captured;
    expect(sent?.url).toBe("http://localhost:1234/v1/chat/completions");
    expect(sent?.headers.get("authorization")).toBe("Bearer secret");
    expect(sent?.body).toMatchObject({
      model: "llama3.2",
      stream: true,
      response_format: { type: "json_schema", json_schema: { name: "interview_question", strict: true } },
    });
  });

  it("defaults to the local Ollama endpoint without auth", async () => {
    const captured: Captured[] = [];
    const reply = completion({ message: { content: "{}" } });
    await createOpenAICompatibleModel({ model: "qwen3", fetch: fakeFetch(200, reply, captured) }).generate(request);
    expect(captured[0]?.url).toBe(`${DEFAULT_OPENAI_COMPATIBLE_BASE_URL}/chat/completions`);
    expect(captured[0]?.headers.has("authorization")).toBe(false);
  });

  it.each([
    ["a refusal", completion({ message: { content: null, refusal: "No" } }), "refused"],
    ["truncation", completion({ finish_reason: "length", message: { content: "{" } }), "failed"],
    ["empty content", completion({ message: { content: null, refusal: "" } }), "failed"],
    ["an unexpected body", { choices: [] }, "failed"],
    ["a non-JSON body", "<html>", "failed"],
  ] as const)("reports %s", async (_case, body, reason) => {
    const model = createOpenAICompatibleModel({ model: "m", fetch: fakeFetch(200, body) });
    expect(await model.generate(request)).toMatchObject({ ok: false, error: { reason } });
  });

  it("reads a streamed completion", async () => {
    const chunk = (delta: Record<string, unknown>, finish: string | null = null): string =>
      `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\n\n`;
    const stream = [chunk({ role: "assistant" }), chunk({ content: '{"text":' }), ": keep-alive\n", chunk({ content: '"Hi"}' }, "stop"), "data: {\"choices\":[]}\n", "data: [DONE]\n"].join("");
    const model = createOpenAICompatibleModel({ model: "m", fetch: fakeFetch(200, stream) });
    expect(await model.generate(request)).toEqual({ ok: true, value: '{"text":"Hi"}' });
    const refused = chunk({ refusal: "No" }, "stop");
    expect(await createOpenAICompatibleModel({ model: "m", fetch: fakeFetch(200, refused) }).generate(request)).toMatchObject({
      ok: false,
      error: { reason: "refused", message: "No" },
    });
  });

  it.each([
    ["a malformed event", "data: {oops\n"],
    ["an unexpected event", 'data: {"error":"model not found"}\n'],
  ])("reports %s in a stream", async (_case, stream) => {
    const model = createOpenAICompatibleModel({ model: "m", fetch: fakeFetch(200, stream) });
    expect(await model.generate(request)).toMatchObject({ ok: false, error: { reason: "failed" } });
  });

  it("reports a stream that breaks off", async () => {
    const broken: typeof globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start: (controller): void => {
              controller.error(new Error("socket hang up"));
            },
          }),
        ),
      );
    expect(await createOpenAICompatibleModel({ model: "m", fetch: broken }).generate(request)).toMatchObject({
      ok: false,
      error: { reason: "unavailable", message: "socket hang up" },
    });
  });

  it("maps HTTP errors and network failures", async () => {
    const unauthorized = createOpenAICompatibleModel({ model: "m", fetch: fakeFetch(401, "bad key") });
    expect(await unauthorized.generate(request)).toMatchObject({ ok: false, error: { reason: "auth", message: "401 bad key" } });
    const offline = createOpenAICompatibleModel({ model: "m", fetch: failingFetch });
    expect(await offline.generate(request)).toMatchObject({ ok: false, error: { reason: "unavailable" } });
    const unreachable = createOpenAICompatibleModel({ model: "m", baseUrl: "http://127.0.0.1:9/v1" });
    expect(await unreachable.generate(request)).toMatchObject({ ok: false, error: { reason: "unavailable" } });
  });
});
