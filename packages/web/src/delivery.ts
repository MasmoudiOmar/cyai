import { fillerAt, spokenWords, type DeliveryMetrics, type EvaluatedTurn, type FillerCount, type Transcriber } from "@cyai/spec";

import { oneDecimal, type Tone } from "./format.js";

/** Delivery across every spoken answer of an interview. */
export interface DeliverySummary {
  readonly answers: number;
  readonly wordsPerMinute: number;
  readonly fillersPerMinute: number;
  readonly fillers: readonly FillerCount[];
  readonly longestPauseMs: number;
  readonly averageLatencyMs: number;
  /** "browser" when any answer was transcribed by the browser, whose filler counts are a lower bound. */
  readonly transcriber: Transcriber;
}

/** Speaking minutes behind one answer's pace, recovered from its word count. */
function speakingMinutes(delivery: DeliveryMetrics): number {
  return delivery.wordsPerMinute === 0 ? 0 : delivery.words / delivery.wordsPerMinute;
}

export function summarizeDelivery(turns: readonly EvaluatedTurn[]): DeliverySummary | undefined {
  const spoken = turns.flatMap((turn) => (turn.answer.delivery === undefined ? [] : [turn.answer.delivery]));
  if (spoken.length === 0) {
    return undefined;
  }
  const minutes = spoken.reduce((sum, delivery) => sum + speakingMinutes(delivery), 0);
  const words = spoken.reduce((sum, delivery) => sum + delivery.words, 0);
  const fillers = new Map<string, number>();
  for (const filler of spoken.flatMap((delivery) => delivery.fillers)) {
    fillers.set(filler.word, (fillers.get(filler.word) ?? 0) + filler.count);
  }
  const fillerCounts = [...fillers].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count);
  const fillerTotal = fillerCounts.reduce((sum, filler) => sum + filler.count, 0);
  return {
    answers: spoken.length,
    wordsPerMinute: minutes === 0 ? 0 : Math.round(words / minutes),
    fillersPerMinute: minutes === 0 ? 0 : oneDecimal(fillerTotal / minutes),
    fillers: fillerCounts,
    longestPauseMs: Math.max(...spoken.map((delivery) => delivery.longestPauseMs)),
    averageLatencyMs: Math.round(spoken.reduce((sum, delivery) => sum + delivery.latencyMs, 0) / spoken.length),
    transcriber: spoken.some((delivery) => delivery.transcriber === "browser") ? "browser" : "whisper",
  };
}

/** Where a measurement sits against what screeners reward; "high" is good. */
export interface Rated {
  readonly band: Tone;
  readonly verdict: string;
}

/** Conversational pace is 120-160 words per minute. */
export function ratePace(wordsPerMinute: number): Rated {
  if (wordsPerMinute < 110) {
    return { band: "mid", verdict: "Slow: aim for 120-160" };
  }
  if (wordsPerMinute > 170) {
    return { band: "mid", verdict: "Fast: aim for 120-160" };
  }
  return { band: "high", verdict: "Steady conversational pace" };
}

export function rateFillers(perMinute: number): Rated {
  if (perMinute < 3) {
    return { band: "high", verdict: "Barely noticeable" };
  }
  return perMinute <= 8 ? { band: "mid", verdict: "Noticeable: aim for under 3" } : { band: "low", verdict: "Distracting: aim for under 3" };
}

export function ratePause(ms: number): Rated {
  if (ms < 3_000) {
    return { band: "high", verdict: "No long silences" };
  }
  return ms <= 5_000 ? { band: "mid", verdict: "A long pause" } : { band: "low", verdict: "Long enough to be cut off" };
}

export function rateLatency(ms: number): Rated {
  if (ms < 2_000) {
    return { band: "high", verdict: "Quick to start" };
  }
  return ms <= 5_000 ? { band: "mid", verdict: "A short wait before starting" } : { band: "low", verdict: "Slow to start" };
}

/** A transcript cut into plain text and fillers, for highlighting. */
export interface Segment {
  readonly text: string;
  readonly filler: boolean;
}

export function fillerSegments(text: string): Segment[] {
  const words = spokenWords(text);
  const segments: Segment[] = [];
  let cursor = 0;
  words.forEach((spoken, index) => {
    const previous = words[index - 1];
    const filler = fillerAt(previous?.word, spoken.word);
    if (filler === undefined) {
      return;
    }
    const start = Math.min(...words.slice(index + 1 - filler.words, index + 1).map((word) => word.start));
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), filler: false });
    }
    segments.push({ text: text.slice(start, spoken.end), filler: true });
    cursor = spoken.end;
  });
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), filler: false });
  }
  return segments;
}
