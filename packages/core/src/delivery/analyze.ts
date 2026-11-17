import type { DeliveryMetrics, FillerCount, SpeechMeasurement } from "@cyai/spec";

/** Hesitation sounds, however many letters a transcriber gives them ("ummm", "uhh"). */
const SOUND_FILLERS: readonly (readonly [string, RegExp])[] = [
  ["um", /^u+m+$/],
  ["uh", /^u+h+$/],
  ["er", /^e+r+m*$/],
  ["ah", /^a+h+$/],
  ["hmm", /^h+m+$/],
  ["mm", /^m{2,}$/],
];

/** Phrases that are almost always verbal padding in an answer. */
const PHRASE_FILLERS: readonly (readonly [string, string])[] = [
  ["you know", "know"],
  ["i mean", "mean"],
];

const MS_PER_MINUTE = 60_000;

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

function soundFiller(token: string): string | undefined {
  return SOUND_FILLERS.find(([, pattern]) => pattern.test(token))?.[0];
}

function phraseFiller(previous: string | undefined, token: string): string | undefined {
  return PHRASE_FILLERS.find(([phrase, last]) => last === token && phrase === `${previous ?? ""} ${token}`)?.[0];
}

function perMinute(count: number, ms: number): number {
  return ms === 0 ? 0 : Math.round((count / (ms / MS_PER_MINUTE)) * 10) / 10;
}

/** How a spoken answer was delivered: pace, fillers, repetitions and pauses. */
export function analyzeDelivery(text: string, speech: SpeechMeasurement): DeliveryMetrics {
  const words = tokens(text);
  const fillers = new Map<string, number>();
  let repetitions = 0;
  words.forEach((token, index) => {
    const previous = words[index - 1];
    const filler = soundFiller(token) ?? phraseFiller(previous, token);
    if (filler !== undefined) {
      fillers.set(filler, (fillers.get(filler) ?? 0) + 1);
    } else if (token === previous) {
      repetitions += 1;
    }
  });
  const fillerCounts: FillerCount[] = [...fillers].map(([word, count]) => ({ word, count }));
  const fillerTotal = fillerCounts.reduce((sum, filler) => sum + filler.count, 0);
  const pausedMs = speech.pauses.reduce((sum, pause) => sum + pause.ms, 0);
  const answerMs = speech.speechMs + pausedMs;
  return {
    words: words.length,
    wordsPerMinute: perMinute(words.length, speech.speechMs),
    fillers: fillerCounts.sort((a, b) => b.count - a.count),
    fillersPerMinute: perMinute(fillerTotal, speech.speechMs),
    repetitions,
    pauseCount: speech.pauses.length,
    longestPauseMs: Math.max(0, ...speech.pauses.map((pause) => pause.ms)),
    latencyMs: speech.latencyMs,
    speakingShare: answerMs === 0 ? 0 : Math.round((speech.speechMs / answerMs) * 100) / 100,
    transcriber: speech.transcriber,
  };
}
