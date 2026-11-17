import { z } from "zod";

/** Lower-case kebab-case identifier, e.g. `live-adaptive-generic`. */
export const idSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "Must be a kebab-case identifier" });
export type Id = z.infer<typeof idSchema>;

/** Non-empty, trimmed human-readable text. */
export const textSchema = z.string().trim().min(1);

/** ISO-8601 timestamp with timezone designator. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;

/** Monotonic integer version of a spec document. */
export const versionSchema = z.int().positive();

/** Integer rubric score on a 1–5 scale. */
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;
export const scoreSchema = z.int().min(SCORE_MIN).max(SCORE_MAX);
export type Score = z.infer<typeof scoreSchema>;

/** Average of scores, so the same range as a score but not necessarily integer. */
export const averageScoreSchema = z.number().min(SCORE_MIN).max(SCORE_MAX);

/** Where personalised questions can be generated from. */
export const candidateContextSourceSchema = z.enum(["resume", "job_description"]);
export type CandidateContextSource = z.infer<typeof candidateContextSourceSchema>;

/** Reasons an interviewer may probe an answer with a follow-up question. */
export const followUpTriggerSchema = z.enum(["vague", "no_example", "unverified_claim", "off_topic"]);
export type FollowUpTrigger = z.infer<typeof followUpTriggerSchema>;

/** True when every item's `id` is distinct. */
export function hasUniqueIds(items: readonly { readonly id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

export const DUPLICATE_ID_MESSAGE = "Identifiers must be unique";
