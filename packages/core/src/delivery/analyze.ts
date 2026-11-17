import { fillerAt, spokenWords, type DeliveryMetrics, type FillerCount, type SpeechMeasurement } from "@cyai/spec";

const MS_PER_MINUTE = 60_000;

function perMinute(count: number, ms: number): number {
  return ms === 0 ? 0 : Math.round((count / (ms / MS_PER_MINUTE)) * 10) / 10;
}

/** How a spoken answer was delivered: pace, fillers, repetitions and pauses. */
export function analyzeDelivery(text: string, speech: SpeechMeasurement): DeliveryMetrics {
  const words = spokenWords(text).map((spoken) => spoken.word);
  const fillers = new Map<string, number>();
  let repetitions = 0;
  words.forEach((word, index) => {
    const previous = words[index - 1];
    const filler = fillerAt(previous, word);
    if (filler !== undefined) {
      fillers.set(filler.word, (fillers.get(filler.word) ?? 0) + 1);
    } else if (word === previous) {
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
    durationMs: speech.latencyMs + answerMs,
    speakingShare: answerMs === 0 ? 0 : Math.round((speech.speechMs / answerMs) * 100) / 100,
    transcriber: speech.transcriber,
  };
}
