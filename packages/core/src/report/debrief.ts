import type { EvaluatedTurn, Scorecard } from "@cyai/spec";

/** Scores are shown with two decimals everywhere. */
export function formatScore(value: number): string {
  return value.toFixed(2);
}

/** Markdown debrief: overall result, per-criterion table and per-question feedback. */
export function formatDebrief(role: string, scorecard: Scorecard, turns: readonly EvaluatedTurn[]): string {
  const rows = scorecard.criteria.map(
    (criterion) => `| ${criterion.criterionId} | ${formatScore(criterion.average)} | ${String(criterion.samples)} |`,
  );
  return [
    `## Interview complete: ${role}`,
    `Overall **${formatScore(scorecard.overall)}/5**: ${scorecard.passed ? "pass" : "below the pass mark"}.`,
    ["| Criterion | Average | Answers scored |", "|---|---|---|", ...rows].join("\n"),
    "### Feedback by question",
    ...turns.map((turn) => `**Q${String(turn.index + 1)}.** ${turn.question.text}\n${turn.evaluation.rationale}`),
  ].join("\n\n");
}
