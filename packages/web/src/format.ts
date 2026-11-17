import type { SessionStatus } from "@cyai/spec";

export function formatScore(value: number): string {
  return value.toFixed(1);
}

export function formatSeconds(total: number): string {
  const seconds = Math.max(0, Math.ceil(total));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const STATUS_LABELS: Readonly<Record<SessionStatus, string>> = {
  created: "Not started",
  awaiting_question: "In progress",
  awaiting_answer: "In progress",
  awaiting_evaluation: "In progress",
  scoring: "Scoring",
  completed: "Completed",
  abandoned: "Stopped",
};

export function statusLabel(status: SessionStatus): string {
  return STATUS_LABELS[status];
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}
