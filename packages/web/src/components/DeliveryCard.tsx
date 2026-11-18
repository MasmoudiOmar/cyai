import type { DeliveryMetrics } from "@cyai/spec";
import type { JSX } from "react";

import { oneDecimal } from "../format.js";
import { fillerSegments, rateFillers, rateLatency, ratePace, ratePause, type DeliverySummary, type Rated } from "../delivery.js";

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

interface Metric {
  readonly label: string;
  readonly value: string;
  readonly rated: Rated;
}

function metrics(summary: Pick<DeliverySummary, "wordsPerMinute" | "fillersPerMinute" | "longestPauseMs">, latencyMs: number): Metric[] {
  return [
    { label: "Pace", value: `${String(Math.round(summary.wordsPerMinute))} wpm`, rated: ratePace(summary.wordsPerMinute) },
    { label: "Fillers", value: `${String(oneDecimal(summary.fillersPerMinute))}/min`, rated: rateFillers(summary.fillersPerMinute) },
    { label: "Longest pause", value: seconds(summary.longestPauseMs), rated: ratePause(summary.longestPauseMs) },
    { label: "Time to start", value: seconds(latencyMs), rated: rateLatency(latencyMs) },
  ];
}

/** How the interview sounded: pace, fillers, silences and how fast each answer started. */
export function DeliveryCard({ summary }: { readonly summary: DeliverySummary }): JSX.Element {
  return (
    <section className="card pad delivery" aria-label="Delivery">
      <h2 className="display">How you sounded</h2>
      <ul className="delivery-grid">
        {metrics(summary, summary.averageLatencyMs).map((metric) => (
          <li key={metric.label} className={`tone-${metric.rated.band}`}>
            <span className="eyebrow">{metric.label}</span>
            <strong className="mono">{metric.value}</strong>
            <span className="muted">{metric.rated.verdict}</span>
          </li>
        ))}
      </ul>
      {summary.fillers.length === 0 ? (
        <p className="muted">No filler words. That is rare: well done.</p>
      ) : (
        <p className="muted">
          Your fillers:{" "}
          {summary.fillers.map((filler) => (
            <span key={filler.word} className="pill">
              “{filler.word}” × {filler.count}
            </span>
          ))}
        </p>
      )}
      {summary.transcriber === "browser" ? (
        <p className="hint">The browser transcribed some answers and drops many fillers, so the real count is likely higher.</p>
      ) : null}
    </section>
  );
}

/** One answer's delivery, as compact pills. */
export function DeliveryPills({ delivery }: { readonly delivery: DeliveryMetrics }): JSX.Element {
  return (
    <ul className="chips">
      {metrics(delivery, delivery.latencyMs).map((metric) => (
        <li key={metric.label} className={`pill tone-${metric.rated.band}`} title={metric.rated.verdict}>
          {metric.label} · {metric.value}
        </li>
      ))}
    </ul>
  );
}

/** A transcript with its fillers marked. */
export function Transcript({ text }: { readonly text: string }): JSX.Element {
  return (
    <>
      {fillerSegments(text).map((segment, index) =>
        segment.filler ? (
          <mark key={index} className="filler">
            {segment.text}
          </mark>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}
