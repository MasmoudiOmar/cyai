import { aiTrainerInterview, evaluation, SESSION_ID } from "@cyai/fixtures";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import { createCyaiServer } from "./server.js";
import { harness, type Harness } from "./test-support/harness.js";
import { MOCK_INTERVIEW_PROMPT, TOOLS } from "./tool-names.js";

async function connect(h: Harness = harness()): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createCyaiServer(h.service).connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

/** The first text block of a tool result, and whether it was an error. */
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> {
  const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));
  const [first] = result.content;
  return { text: first?.type === "text" ? first.text : "", isError: result.isError === true };
}

describe("cyai MCP server", () => {
  it("exposes the interview tools and server instructions", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(Object.values(TOOLS).sort());
    expect(client.getInstructions()).toContain("never use cyai to assist during a real interview");
  });

  it("runs an interview over MCP, including evaluation input validation", async () => {
    const client = await connect();
    expect((await call(client, TOOLS.listInterviews)).text).toContain(aiTrainerInterview.id);

    const first = await call(client, TOOLS.start, { interviewId: aiTrainerInterview.id, jobDescription: "Rank outputs." });
    expect(first.text).toContain("**Question 1**");

    expect((await call(client, TOOLS.submitAnswer, { sessionId: SESSION_ID, answer: "My answer" })).text).toContain(
      "<evaluator_instructions>",
    );
    const next = await call(client, TOOLS.submitEvaluation, { sessionId: SESSION_ID, ...evaluation(4) });
    expect(next.text).toContain("<interviewer_instructions>");
    expect((await call(client, TOOLS.provideQuestion, { sessionId: SESSION_ID, text: "Why this?" })).text).toContain(
      "> Why this?",
    );
    expect((await call(client, TOOLS.resume, { sessionId: SESSION_ID })).text).toContain("> Why this?");
    expect((await call(client, TOOLS.listSessions)).text).toContain("awaiting_answer");
    expect((await call(client, TOOLS.abandon, { sessionId: SESSION_ID })).text).toContain("Ended by the candidate.");
  });

  it("returns tool errors the agent can act on", async () => {
    const h = harness();
    const client = await connect(h);
    const missing = await call(client, TOOLS.start, { interviewId: "nope" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('Unknown interview "nope".');
    h.store.failing.add("list");
    expect((await call(client, TOOLS.listSessions)).isError).toBe(true);
  });

  it("offers a mock interview prompt, optionally for a given interview", async () => {
    const client = await connect();
    const generic = await client.getPrompt({ name: MOCK_INTERVIEW_PROMPT });
    const specific = await client.getPrompt({ name: MOCK_INTERVIEW_PROMPT, arguments: { interviewId: "x" } });
    const textOf = (message: (typeof generic.messages)[number] | undefined): string =>
      message?.content.type === "text" ? message.content.text : "";
    expect(textOf(generic.messages[0])).toContain("`list_interviews`");
    expect(textOf(specific.messages[0])).toContain('Use the interview "x".');
  });
});
