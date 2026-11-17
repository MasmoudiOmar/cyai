import { useId, type JSX, type ReactNode } from "react";

import { scoreTone } from "../format.js";

interface RingProps {
  /** 0 to 1. */
  readonly progress: number;
  readonly size: number;
  readonly stroke: number;
  readonly gradient?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

/** A circular progress ring, filled clockwise from the top. */
export function Ring({ progress, size, stroke, gradient = false, className = "", children }: RingProps): JSX.Element {
  const id = useId();
  const radius = (size - stroke) / 2;
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <span className={`ring ${className}`.trim()}>
      <svg width={size} height={size} aria-hidden="true">
        {gradient ? (
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8b7cff" />
              <stop offset="55%" stopColor="#c77dff" />
              <stop offset="100%" stopColor="#ff8a6b" />
            </linearGradient>
          </defs>
        ) : null}
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={gradient ? `url(#${id})` : "currentColor"}
          strokeWidth={stroke}
          // A unit path length lets CSS animate the fill without knowing the circle's size.
          pathLength={1}
          strokeDasharray={1}
          style={{ strokeDashoffset: 1 - clamped }}
        />
      </svg>
      <span className="ring-label">{children}</span>
    </span>
  );
}

const SCORE_MAX = 5;

interface ScoreRingProps {
  readonly score: number;
  readonly size?: number;
  readonly label?: string;
}

/** A score out of five: a large gradient ring, or a small ring tinted by how good the score is. */
export function ScoreRing({ score, size = 40, label }: ScoreRingProps): JSX.Element {
  const large = size >= 100;
  return (
    <Ring
      progress={score / SCORE_MAX}
      size={size}
      stroke={large ? 10 : 4}
      gradient={large}
      className={large ? "" : `small tone-${scoreTone(score)}`}
    >
      <strong>{score.toFixed(1)}</strong>
      {label === undefined ? null : <small>{label}</small>}
    </Ring>
  );
}
