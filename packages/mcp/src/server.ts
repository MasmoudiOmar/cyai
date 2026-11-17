import { CYAI_VERSION } from "@cyai/core";
import { turnEvaluationSchema, type Result } from "@cyai/spec";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { renderError, renderInterviews, renderReply, renderSessions } from "./render.js";
import type { InterviewService, Reply, ServiceError } from "./service.js";
import { MOCK_INTERVIEW_PROMPT, TOOLS } from "./tool-names.js";

const INSTRUCTIONS = [
  "cyai runs mock interviews that simulate AI-run screening interviews. You play the interviewer and evaluator; the user is the candidate.",
  `Start with \`${TOOLS.listInterviews}\`, then \`${TOOLS.start}\`. Every tool result says exactly what to show the candidate and which tool to call next: follow it.`,
  "Never coach, hint or reveal scores while the interview is running. Share the debrief only when it is complete.",
  "This is practice only: never use cyai to assist during a real interview.",
].join("\n");

const sessionId = z.string().describe("Session id returned by start_interview.");

function text(body: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text: body }], ...(isError ? { isError: true } : {}) };
}

function reply(result: Result<Reply, ServiceError>): CallToolResult {
  return result.ok ? text(renderReply(result.value)) : text(renderError(result.error), true);
}

function mockInterviewPrompt(interviewId: string | undefined): GetPromptResult {
  const start =
    interviewId === undefined
      ? `Call \`${TOOLS.listInterviews}\` and help me pick an interview.`
      : `Use the interview "${interviewId}".`;
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "Run a cyai mock interview with me. You are the interviewer; I am the candidate.",
            start,
            "Before starting, ask whether I want to share my resume and the job description (I can paste them or give file paths for you to read).",
            "Then follow each tool result exactly. Stay in character, do not coach me mid-interview, and give me the debrief at the end.",
          ].join("\n"),
        },
      },
    ],
  };
}

/** An MCP server exposing the interview service. The connected agent acts as interviewer. */
export function createCyaiServer(service: InterviewService): McpServer {
  const server = new McpServer({ name: "cyai", version: CYAI_VERSION }, { instructions: INSTRUCTIONS });

  server.registerTool(
    TOOLS.listInterviews,
    { title: "List interviews", description: "List the practice interviews that are installed." },
    () => text(renderInterviews(service.listInterviews())),
  );

  server.registerTool(
    TOOLS.listSessions,
    { title: "List sessions", description: "List past and in-progress practice sessions, newest first." },
    async () => {
      const sessions = await service.listSessions();
      return sessions.ok ? text(renderSessions(sessions.value)) : text(renderError(sessions.error), true);
    },
  );

  server.registerTool(
    TOOLS.start,
    {
      title: "Start interview",
      description: "Start a practice interview. Returns the first question or instructions to write it.",
      inputSchema: {
        interviewId: z.string().describe("Id from list_interviews."),
        resume: z.string().optional().describe("Candidate resume text, used to personalise questions."),
        jobDescription: z.string().optional().describe("Job description text, used to personalise questions."),
      },
    },
    async (input) => reply(await service.start(input)),
  );

  server.registerTool(
    TOOLS.provideQuestion,
    {
      title: "Provide question",
      description: "Submit the interview question you wrote when asked to write one.",
      inputSchema: { sessionId, text: z.string().describe("The question only, exactly as it should be asked.") },
    },
    async (input) => reply(await service.provideQuestion(input.sessionId, input.text)),
  );

  server.registerTool(
    TOOLS.submitAnswer,
    {
      title: "Submit answer",
      description: "Record the candidate's answer to the current question, verbatim.",
      inputSchema: { sessionId, answer: z.string().describe("The candidate's answer, unedited.") },
    },
    async (input) => reply(await service.submitAnswer(input.sessionId, input.answer)),
  );

  server.registerTool(
    TOOLS.submitEvaluation,
    {
      title: "Submit evaluation",
      description: "Submit your rubric evaluation of the last answer. Returns the next step.",
      inputSchema: { sessionId, ...turnEvaluationSchema.shape },
    },
    async ({ sessionId: id, ...evaluation }) => reply(await service.submitEvaluation(id, evaluation)),
  );

  server.registerTool(
    TOOLS.resume,
    {
      title: "Resume interview",
      description: "Get the current step of a session again, for example after losing track.",
      inputSchema: { sessionId },
    },
    async (input) => reply(await service.resume(input.sessionId)),
  );

  server.registerTool(
    TOOLS.abandon,
    {
      title: "Abandon interview",
      description: "End a session early without scoring it.",
      inputSchema: { sessionId, reason: z.string().default("Ended by the candidate.") },
    },
    async (input) => reply(await service.abandon(input.sessionId, input.reason)),
  );

  server.registerPrompt(
    MOCK_INTERVIEW_PROMPT,
    {
      title: "Mock interview",
      description: "Run a practice interview that simulates an AI interviewer.",
      argsSchema: { interviewId: z.string().optional() },
    },
    ({ interviewId }) => mockInterviewPrompt(interviewId),
  );

  return server;
}
