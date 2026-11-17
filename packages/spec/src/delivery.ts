import { z } from "zod";

/**
 * Spoken delivery. The browser measures timing from the microphone; the server derives
 * the metrics from that timing and the transcript, so every interface reports them alike.
 */

/** Who turned speech into text. Browser recognisers tend to drop fillers, so counts are less reliable. */
export const transcriberSchema = z.enum(["whisper", "browser"]);
export type Transcriber = z.infer<typeof transcriberSchema>;

const milliseconds = z.int().nonnegative();

/** A silence inside an answer, `atMs` after the candidate first spoke. */
export const pauseSchema = z.strictObject({ atMs: milliseconds, ms: milliseconds });
export type Pause = z.infer<typeof pauseSchema>;

/** Up to one pause per 200 ms of a three-hour answer; bounds request bodies. */
export const PAUSES_MAX = 2_000;

/** What the microphone measured for one spoken answer. */
export const speechMeasurementSchema = z.strictObject({
  /** Time spent speaking, pauses excluded. */
  speechMs: milliseconds,
  /** From the end of the question to the first word. */
  latencyMs: milliseconds,
  pauses: z.array(pauseSchema).max(PAUSES_MAX),
  transcriber: transcriberSchema,
});
export type SpeechMeasurement = z.infer<typeof speechMeasurementSchema>;

export const fillerCountSchema = z.strictObject({ word: z.string().min(1), count: z.int().positive() });
export type FillerCount = z.infer<typeof fillerCountSchema>;

/** How an answer was said, as opposed to what it said. */
export const deliveryMetricsSchema = z.strictObject({
  words: z.int().nonnegative(),
  wordsPerMinute: z.number().nonnegative(),
  fillers: z.array(fillerCountSchema),
  fillersPerMinute: z.number().nonnegative(),
  /** Immediately repeated words, e.g. "I I think". */
  repetitions: z.int().nonnegative(),
  pauseCount: z.int().nonnegative(),
  longestPauseMs: milliseconds,
  latencyMs: milliseconds,
  /** Share of the answer spent speaking rather than pausing, 0 to 1. */
  speakingShare: z.number().min(0).max(1),
  transcriber: transcriberSchema,
});
export type DeliveryMetrics = z.infer<typeof deliveryMetricsSchema>;
