import type { CompletedView, EvaluatedTurn, Overtime } from "@cyai/spec";
import type { JSX } from "react";

import { formatScore, scoreTone } from "../format.js";
import { hrefFor } from "../route.js";
import { Arrow, Icon } from "./Icon.js";
import { ScoreRing } from "./ScoreRing.js";

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

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function TurnFeedback({ turn, label }: { readonly turn: EvaluatedTurn; readonly label: Labeler }): JSX.Element {
  const answered = turn.answer.text.trim().length > 0;
  return (
    <article className="card pad turn">
      <div className="turn-head">
        <span className="eyebrow">Question {turn.index + 1}</span>
        {turn.question.followUpOf === undefined ? null : <span className="pill accent">Follow-up</span>}
        {turn.overtime === "none" ? null : <span className="pill warning">{OVERTIME_LABELS[turn.overtime]}</span>}
        <ScoreRing score={average(turn.evaluation.scores.map((score) => score.score))} />
      </div>
      <h3 className="display">{turn.question.text}</h3>
      <details>
        <summary>
          <Icon name="chevron" size={15} /> Your answer
        </summary>
        <blockquote>{answered ? turn.answer.text : "(no answer)"}</blockquote>
      </details>
      <p className="feedback">
        <Icon name="spark" />
        <span>{turn.evaluation.rationale}</span>
      </p>
      <ul className="chips">
        {turn.evaluation.scores.map((score) => (
          <li key={score.criterionId} className={`pill tone-${scoreTone(score.score)}`}>
            {label(score.criterionId)} · {score.score}/{SCORE_MAX}
          </li>
        ))}
      </ul>
    </article>
  );
}

/** The scored result: verdict, strongest and weakest criteria, a bar per criterion, then feedback per answer. */
export function Debrief({ view }: { readonly view: CompletedView }): JSX.Element {
  const label = labeler(view);
  const { scorecard } = view;
  // The schema guarantees at least one criterion, so these reductions always have a value.
  const strongest = scorecard.criteria.reduce((best, criterion) => (criterion.average > best.average ? criterion : best));
  const weakest = scorecard.criteria.reduce((worst, criterion) => (criterion.average < worst.average ? criterion : worst));
  return (
    <div className="room">
      <section className="card pad result" aria-label="Result">
        <ScoreRing score={scorecard.overall} size={176} label={`out of ${String(SCORE_MAX)}`} />
        <div>
          <p className="eyebrow">Interview complete</p>
          <h1 className="display">{view.role}</h1>
          <div className="result-pills">
            <span className={scorecard.passed ? "pill success" : "pill warning"}>
              <Icon name={scorecard.passed ? "check" : "target"} size={14} />
              {scorecard.passed ? "Pass" : "Below the pass mark"}
            </span>
            <span className="pill">Pass mark {formatScore(view.passThreshold)}</span>
            <span className="pill">
              {scorecard.evaluatedTurns} {scorecard.evaluatedTurns === 1 ? "answer" : "answers"} scored
            </span>
          </div>
          <div className="highlights">
              <div className="highlight">
                <span className="eyebrow">Strongest</span>
                <strong>{label(strongest.criterionId)}</strong>
              </div>
              <div className="highlight">
                <span className="eyebrow">Work on next</span>
                <strong>{label(weakest.criterionId)}</strong>
              </div>
          </div>
          <div className="result-actions">
            <a className="button primary" href={hrefFor({ page: "setup", interviewId: view.interviewId })}>
              Practise again <Arrow />
            </a>
            <a className="button ghost" href={hrefFor({ page: "home" })}>
              All interviews
            </a>
          </div>
        </div>
      </section>

      <section className="card pad">
        <h2 className="display">Scores by criterion</h2>
        <ul className="criteria">
          {scorecard.criteria.map((criterion) => (
            <li key={criterion.criterionId}>
              <span className="criterion-head">
                <span>{label(criterion.criterionId)}</span>
                <span className={`mono tone-${scoreTone(criterion.average)}`}>{formatScore(criterion.average)}</span>
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

      <div className="section-head">
        <h2 className="display">Question by question</h2>
      </div>
      <div className="turns">
        {view.turns.map((turn) => (
          <TurnFeedback key={turn.index} turn={turn} label={label} />
        ))}
      </div>
    </div>
  );
}
