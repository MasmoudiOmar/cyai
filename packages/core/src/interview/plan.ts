import { ok, type IsoDateTime, type Result, type SessionIn } from "@cyai/spec";

import { decideNextStep, followUpCount, type NextStep } from "../policy/next-step.js";
import type { ModelRequest } from "../ports/index.js";
import type { BindingMismatch } from "../shared/binding.js";
import type { InterviewContext } from "./context.js";
import { questionRequest } from "./prompts.js";
import { followUpQuestionId, generatedQuestionId, slotFor } from "./question-plan.js";

/** A question ready to be put to the candidate. */
export interface QuestionToAsk {
  readonly questionId: string;
  readonly text: string;
  readonly followUpOf?: number;
}

/** The next question must be written by a model or agent from `request`. */
export interface GenerateInstruction {
  readonly kind: "generate";
  readonly questionId: string;
  readonly followUpOf?: number;
  readonly request: ModelRequest;
}

export type FinishInstruction = Extract<NextStep, { kind: "finish" }>;

export type Instruction = { readonly kind: "ask"; readonly question: QuestionToAsk } | GenerateInstruction | FinishInstruction;

/** Decides the next action and, when a question is needed, where its text comes from. */
export function planNext(
  context: InterviewContext,
  session: SessionIn<"awaiting_question">,
  now: IsoDateTime,
): Result<Instruction, BindingMismatch> {
  const decision = decideNextStep(session, context.profile, now);
  if (!decision.ok) {
    return decision;
  }
  const step = decision.value;
  switch (step.kind) {
    case "finish":
      return ok(step);
    case "follow_up":
      return ok({
        kind: "generate",
        questionId: followUpQuestionId(step.of, followUpCount(session.turns, step.of) + 1),
        followUpOf: step.of,
        request: questionRequest(context, session.turns, step),
      });
    case "new_question": {
      const slot = slotFor(context.interview, step.number);
      if (slot === undefined) {
        return ok({ kind: "finish", reason: "question_budget" });
      }
      return ok(
        slot.kind === "fixed"
          ? { kind: "ask", question: { questionId: slot.question.id, text: slot.question.text } }
          : {
              kind: "generate",
              questionId: generatedQuestionId(step.number),
              request: questionRequest(context, session.turns, slot),
            },
      );
    }
  }
}
