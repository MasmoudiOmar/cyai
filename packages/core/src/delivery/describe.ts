import type { DeliveryMetrics } from "@cyai/spec";

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** The delivery measurements as plain lines, for prompts and reports. */
export function describeDelivery(delivery: DeliveryMetrics): string {
  const fillers =
    delivery.fillers.length === 0
      ? "none"
      : delivery.fillers.map((filler) => `"${filler.word}" x${String(filler.count)}`).join(", ");
  return [
    `Pace: ${String(delivery.wordsPerMinute)} words per minute over ${String(delivery.words)} words.`,
    `Fillers: ${String(delivery.fillersPerMinute)} per minute (${fillers}).`,
    `Immediate repetitions: ${String(delivery.repetitions)}.`,
    `Pauses over one second: ${String(delivery.pauseCount)}, longest ${seconds(delivery.longestPauseMs)}.`,
    `Time to start answering: ${seconds(delivery.latencyMs)}. Share of the answer spent speaking: ${String(Math.round(delivery.speakingShare * 100))}%.`,
    delivery.transcriber === "whisper"
      ? "Transcribed verbatim: fillers and false starts are kept."
      : "Transcribed by the browser, which drops many fillers: counts are a lower bound.",
  ].join("\n");
}
