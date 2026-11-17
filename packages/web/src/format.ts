import type { InterviewSummary, SessionStatus } from "@cyai/spec";

import type { IconName } from "./components/Icon.js";

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

/** Sessions the candidate can still continue. */
export function isOpen(status: SessionStatus): boolean {
  return statusLabel(status) === "In progress";
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export type Tone = "high" | "mid" | "low";

/** 4 and up reads as strong, under 3 as weak. */
export function scoreTone(score: number): Tone {
  return score >= 4 ? "high" : score >= 3 ? "mid" : "low";
}

interface FormatInfo {
  readonly label: string;
  readonly icon: IconName;
}

export const FORMATS: Readonly<Record<InterviewSummary["format"], FormatInfo>> = {
  async: { label: "Async video screen", icon: "video" },
  live: { label: "Live adaptive", icon: "live" },
  chat: { label: "Chat screener", icon: "chat" },
};

/** "graduate-program-behavioral" → "Graduate program behavioral", for sessions whose interview is gone. */
export function humanize(id: string): string {
  const words = id.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
