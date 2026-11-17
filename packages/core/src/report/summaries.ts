import type { SessionRecord, SessionStatus } from "@cyai/spec";

import type { TemplateCatalog } from "../catalog/catalog.js";
import { isIn } from "../session/guards.js";
import { formatScore } from "./debrief.js";

export interface InterviewSummary {
  readonly id: string;
  readonly role: string;
  readonly profile: string;
  readonly format: string;
  readonly totalMinutes: number;
  readonly maxQuestions: number;
}

export interface SessionSummary {
  readonly sessionId: string;
  readonly interviewId: string;
  readonly status: SessionStatus;
  readonly createdAt: string;
  readonly overall?: number;
}

/** Interviews whose profile is installed, in catalog order. */
export function summarizeInterviews(catalog: TemplateCatalog): readonly InterviewSummary[] {
  return [...catalog.interviews.values()].flatMap((interview) => {
    const profile = catalog.profiles.get(interview.profileId);
    return profile === undefined
      ? []
      : [
          {
            id: interview.id,
            role: interview.role,
            profile: profile.name,
            format: profile.format,
            totalMinutes: profile.timing.totalMinutes,
            maxQuestions: profile.turnPolicy.maxQuestions,
          },
        ];
  });
}

export function summarizeSession({ session }: SessionRecord): SessionSummary {
  return {
    sessionId: session.id,
    interviewId: session.interviewId,
    status: session.status,
    createdAt: session.createdAt,
    ...(isIn(session, "completed") ? { overall: session.scorecard.overall } : {}),
  };
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}

export function formatInterviewTable(interviews: readonly InterviewSummary[]): string {
  return interviews.length === 0
    ? "No interviews are installed."
    : table(
        ["Interview id", "Role", "Interviewer", "Length", "Questions"],
        interviews.map((item) => [
          item.id,
          item.role,
          `${item.profile} (${item.format})`,
          `${String(item.totalMinutes)} min`,
          `up to ${String(item.maxQuestions)}`,
        ]),
      );
}

export function formatSessionTable(sessions: readonly SessionSummary[]): string {
  return sessions.length === 0
    ? "No practice sessions yet."
    : table(
        ["Session", "Interview", "Status", "Started", "Overall"],
        sessions.map((item) => [
          item.sessionId,
          item.interviewId,
          item.status,
          item.createdAt,
          item.overall === undefined ? "-" : formatScore(item.overall),
        ]),
      );
}
