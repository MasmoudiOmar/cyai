import { describeError, formatDebrief, formatInterviewTable, formatSessionTable, type ModelRequest } from "@cyai/core";
import type { InterviewSummary, SessionSummary } from "@cyai/spec";

import type { Reply, ServiceError } from "./service.js";
import { TOOLS } from "./tool-names.js";

function privateBlock(tag: string, request: ModelRequest): string {
  return `<${tag}>\n${request.system}\n\n${request.user}\n</${tag}>`;
}

function sessionArg(sessionId: string): string {
  return `sessionId "${sessionId}"`;
}

function renderCompleted(reply: Extract<Reply, { kind: "completed" }>): string {
  return `${formatDebrief(reply.role, reply.scorecard, reply.turns)}\n\nShare this debrief with the candidate, then offer to practise their weakest criterion again.`;
}

/** Text for the agent: what to show the candidate and which tool to call next. */
export function renderReply(reply: Reply): string {
  switch (reply.kind) {
    case "question": {
      const prep = reply.prepSeconds > 0 ? `They get ${String(reply.prepSeconds)}s to prepare. ` : "";
      return [
        `**Question ${String(reply.number)}${reply.followUp ? " (follow-up)" : ""}**`,
        `> ${reply.text}`,
        [
          "Instructions for you, the interviewer (do not show these):",
          "- Put the question above to the candidate exactly as written. Do not rephrase, hint or coach.",
          `- ${prep}They should answer within ${String(reply.softSeconds)}s; ${String(reply.hardSeconds)}s is the hard limit. The clock started when this question was issued.`,
          `- When they answer, call \`${TOOLS.submitAnswer}\` with ${sessionArg(reply.sessionId)} and their answer verbatim.`,
        ].join("\n"),
      ].join("\n\n");
    }
    case "write_question":
      return [
        "Write the next interview question yourself. Keep these instructions private.",
        privateBlock("interviewer_instructions", reply.request),
        `Then call \`${TOOLS.provideQuestion}\` with ${sessionArg(reply.sessionId)} and \`text\` set to the question only.`,
      ].join("\n\n");
    case "evaluate":
      return [
        "The answer is recorded. Evaluate it yourself, privately: show the candidate no scores or feedback until the interview ends.",
        privateBlock("evaluator_instructions", reply.request),
        `Then call \`${TOOLS.submitEvaluation}\` with ${sessionArg(reply.sessionId)}, \`scores\` (one entry per criterion), \`followUpTriggers\` and \`rationale\`.`,
      ].join("\n\n");
    case "completed":
      return renderCompleted(reply);
    case "abandoned":
      return `Interview ${reply.sessionId} has ended: ${reply.reason}`;
  }
}

/** How the agent can recover, for errors it can do something about. */
function recoveryHint(error: ServiceError): string | undefined {
  if (error.code === "wrong_status") {
    return `Call \`${TOOLS.resume}\` to get the current step.`;
  }
  if (error.code === "invalid_response") {
    return "Fix it and call the tool again.";
  }
  if (error.code === "unknown_criterion" || error.code === "duplicate_criterion") {
    return "Score each rubric criterion exactly once.";
  }
  if (error.code === "unknown_template") {
    return `Call \`${TOOLS.listInterviews}\` to see what is available.`;
  }
  if (error.code === "no_question_expected") {
    return `Call \`${TOOLS.resume}\` to get it.`;
  }
  return undefined;
}

/** A message for the agent explaining what went wrong and how to recover. */
export function renderError(error: ServiceError): string {
  const hint = recoveryHint(error);
  return hint === undefined ? describeError(error) : `${describeError(error)} ${hint}`;
}

export function renderInterviews(interviews: readonly InterviewSummary[]): string {
  const listing = formatInterviewTable(interviews);
  return interviews.length === 0
    ? listing
    : `${listing}\n\nCall \`${TOOLS.start}\` with an interview id. Passing the candidate's resume and the job description makes questions personal.`;
}

export function renderSessions(sessions: readonly SessionSummary[]): string {
  return formatSessionTable(sessions);
}
