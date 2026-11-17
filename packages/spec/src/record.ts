import { z } from "zod";

import { textSchema } from "./primitives.js";
import { sessionSchema } from "./session.js";

/** Optional candidate material that personalises generated questions. */
export const candidateContextSchema = z.strictObject({
  resume: textSchema.optional(),
  jobDescription: textSchema.optional(),
});
export type CandidateContext = z.infer<typeof candidateContextSchema>;

/** What a session store persists: the session plus the candidate context it was started with. */
export const sessionRecordSchema = z.strictObject({
  session: sessionSchema,
  candidate: candidateContextSchema,
});
export type SessionRecord = z.infer<typeof sessionRecordSchema>;
