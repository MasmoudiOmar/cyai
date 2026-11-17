import { SESSION_ID, unwrap, unwrapErr } from "@cyai/fixtures";
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
    expect(unwrap(await client({ version: "1", model: "m" }).info())).toEqual({ version: "1", model: "m" });
    expect(unwrap(await client([interview]).interviews())).toEqual([interview]);
    expect(unwrap(await client([session]).sessions())).toEqual([session]);
    expect(unwrap(await client(question).start({ interviewId: interview.id }))).toEqual(question);
    expect(unwrap(await client(question).session(SESSION_ID))).toEqual(question);
    expect(unwrap(await client(completed).answer(SESSION_ID, "Hi"))).toEqual(completed);
    expect(unwrap(await client(abandoned).abandon(SESSION_ID))).toEqual(abandoned);
    expect(calls.map((call) => [call.input, call.init?.method ?? "GET", call.init?.body])).toEqual([
      ["/api/info", "GET", undefined],
      ["/api/interviews", "GET", undefined],
      ["/api/sessions", "GET", undefined],
      ["/api/sessions", "POST", '{"interviewId":"ai-trainer-generalist"}'],
      [`/api/sessions/${SESSION_ID}`, "GET", undefined],
      [`/api/sessions/${SESSION_ID}/answer`, "POST", '{"answer":"Hi"}'],
      [`/api/sessions/${SESSION_ID}/abandon`, "POST", "{}"],
    ]);
  });

  it("explains failures in plain words", async () => {
    expect(unwrapErr(await createApiClient(() => Promise.reject(new Error("down"))).info())).toBe(UNREACHABLE);
    expect(unwrapErr(await createApiClient(respond(502, '{"error":"The model is overloaded."}')).info())).toBe(
      "The model is overloaded.",
    );
    expect(unwrapErr(await createApiClient(respond(500, "{}")).info())).toBe("Request failed (HTTP 500).");
    expect(unwrapErr(await createApiClient(respond(200, "<html>")).info())).toBe("The server sent an unreadable response (HTTP 200).");
    expect(unwrapErr(await createApiClient(respond(200, '{"version":1}')).info())).toMatch(/^Unexpected response from the server: /);
  });

  it("uses the browser fetch by default", async () => {
    vi.stubGlobal("fetch", respond(200, '{"version":"1","model":"m"}'));
    try {
      expect(unwrap(await createApiClient().info())).toEqual({ version: "1", model: "m" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
