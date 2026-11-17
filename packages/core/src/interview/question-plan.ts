import type { CandidateContextSource, FixedQuestion, InterviewSpec } from "@cyai/spec";

/** One primary question position in an interview. */
export type QuestionSlot =
  | { readonly kind: "fixed"; readonly question: FixedQuestion }
  | { readonly kind: "generated"; readonly source: CandidateContextSource };

/** Expands the question bank into ordered slots: fixed questions as written, generated ones by count. */
export function questionSlots(interview: InterviewSpec): readonly QuestionSlot[] {
  return interview.questionBank.flatMap((entry): QuestionSlot[] =>
    entry.kind === "fixed"
      ? [{ kind: "fixed", question: entry }]
      : Array.from({ length: entry.count }, () => ({ kind: "generated", source: entry.source })),
  );
}

/** The slot for the 1-based primary question `number`, if the bank has one. */
export function slotFor(interview: InterviewSpec, number: number): QuestionSlot | undefined {
  return questionSlots(interview)[number - 1];
}

export function generatedQuestionId(number: number): string {
  return `gen-${String(number)}`;
}

export function followUpQuestionId(rootIndex: number, ordinal: number): string {
  return `fu-${String(rootIndex)}-${String(ordinal)}`;
}
