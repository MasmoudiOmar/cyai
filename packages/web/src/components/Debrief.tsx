import type { CompletedView, EvaluatedTurn, Overtime } from "@cyai/spec";
import type { JSX } from "react";

import { formatScore } from "../format.js";

const SCORE_MAX = 5;

const OVERTIME_LABELS: Readonly<Record<Exclude<Overtime, "none">, string>> = {
  soft: "Over the suggested time",
  hard: "Over the time limit",
};

type Labeler = (criterionId: string) => string;

function labeler(view: CompletedView): Labeler {
  const labels = new Map(view.criteria.map((criterion) => [criterion.id, criterion.label]));
  return (criterionId) => labels.get(criterionId) ?? criterionId;
}

function TurnFeedback({ turn, label }: { readonly turn: EvaluatedTurn; readonly label: Labeler }): JSX.Element {
  return (
    <article className="card turn">
      <p className="eyebrow">
        Question {turn.index + 1}
        {turn.question.followUpOf === undefined ? null : <span className="badge">Follow-up</span>}
        {turn.overtime === "none" ? null : <span className="badge warn">{OVERTIME_LABELS[turn.overtime]}</span>}
      </p>
      <h3>{turn.question.text}</h3>
      <details>
        <summary>Your answer</summary>
        <p className="answer-text">{turn.answer.text.trim().length > 0 ? turn.answer.text : "(no answer)"}</p>
      </details>
      <p>{turn.evaluation.rationale}</p>
      <ul className="chips">
        {turn.evaluation.scores.map((score) => (
          <li key={score.criterionId}>
            {label(score.criterionId)}: {score.score}/{SCORE_MAX}
          </li>
        ))}
      </ul>
    </article>
  );
}

/** The scored result: overall verdict, a bar per criterion, then feedback per question. */
export function Debrief({ view }: { readonly view: CompletedView }): JSX.Element {
  const label = labeler(view);
  const { scorecard } = view;
  return (
    <>
      <section className="card result" aria-label="Result">
        <p className="eyebrow">Interview complete · {view.role}</p>
        <p className="score-hero">
          <span className="score">{formatScore(scorecard.overall)}</span>
          <span className="out-of">/ {SCORE_MAX}</span>
        </p>
        <p className={scorecard.passed ? "verdict pass" : "verdict fail"}>
          {scorecard.passed ? "Pass" : "Below the pass mark"} · pass mark {formatScore(view.passThreshold)}
        </p>
        <ul className="criteria">
          {scorecard.criteria.map((criterion) => (
            <li key={criterion.criterionId}>
              <span className="criterion-head">
                <span>{label(criterion.criterionId)}</span>
                <span>{formatScore(criterion.average)}</span>
              </span>
              <span
                className="bar"
                role="meter"
                aria-label={label(criterion.criterionId)}
                aria-valuemin={1}
                aria-valuemax={SCORE_MAX}
                aria-valuenow={criterion.average}
              >
                <span style={{ width: `${String((criterion.average / SCORE_MAX) * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </section>
      <h2 className="section-title">Feedback by question</h2>
      {view.turns.map((turn) => (
        <TurnFeedback key={turn.index} turn={turn} label={label} />
      ))}
    </>
  );
}
