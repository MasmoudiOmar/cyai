import type { InterviewSummary, SessionRecord, SessionSummary } from "@cyai/spec";

import type { TemplateCatalog } from "../catalog/catalog.js";
import { isIn } from "../session/guards.js";
import { formatScore } from "./debrief.js";

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
            prepSeconds: profile.timing.prepSeconds,
            softSeconds: profile.timing.answer.softSeconds,
            hardSeconds: profile.timing.answer.hardSeconds,
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

/** `markdown` for agents and documents; `plain` pads columns for a terminal. */
export type TableStyle = "markdown" | "plain";

function markdownTable(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}

/** The cell in `column`, or "" for a short row. Avoids `undefined` from indexing. */
function cellAt(cells: readonly string[], column: number): string {
  return cells.slice(column, column + 1).join("");
}

function plainTable(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((_, column) => Math.max(...[header, ...rows].map((cells) => cellAt(cells, column).length)));
  const line = (cells: readonly string[]): string =>
    widths.map((width, column) => cellAt(cells, column).padEnd(width)).join("  ").trimEnd();
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join("\n");
}

function table(style: TableStyle, header: readonly string[], rows: readonly (readonly string[])[]): string {
  return style === "markdown" ? markdownTable(header, rows) : plainTable(header, rows);
}

export function formatInterviewTable(interviews: readonly InterviewSummary[], style: TableStyle = "markdown"): string {
  return interviews.length === 0
    ? "No interviews are installed."
    : table(
        style,
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

export function formatSessionTable(sessions: readonly SessionSummary[], style: TableStyle = "markdown"): string {
  return sessions.length === 0
    ? "No practice sessions yet."
    : table(
        style,
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
