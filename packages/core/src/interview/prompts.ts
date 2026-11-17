import {
  evaluationResponseFormat,
  questionResponseFormat,
  type AnsweredTurn,
  type CandidateContextSource,
  type EvaluatedTurn,
  type FollowUpTrigger,
  type ResponseFormat,
  type TurnEvaluation,
} from "@cyai/spec";

import { describeDelivery } from "../delivery/describe.js";
import type { ModelRequest } from "../ports/index.js";
import type { InterviewContext } from "./context.js";

export const FOLLOW_UP_TRIGGER_MEANINGS: Readonly<Record<FollowUpTrigger, string>> = {
  vague: "the answer stays general and lacks concrete detail",
  no_example: "the answer makes a claim without a specific example",
  unverified_claim: "the answer asserts results or skills it does not substantiate",
  off_topic: "the answer does not address the question",
};

const SOURCE_LABELS: Readonly<Record<CandidateContextSource, string>> = {
  resume: "the candidate's resume",
  job_description: "the job description",
};

/** What the next generated question should do. */
export type QuestionTask =
  | { readonly kind: "generated"; readonly source: CandidateContextSource }
  | { readonly kind: "follow_up"; readonly of: number; readonly triggers: readonly FollowUpTrigger[] };

const JSON_ONLY = "Respond only with JSON matching the provided schema.";

function section(tag: string, body: string | undefined): string[] {
  return body === undefined ? [] : [`<${tag}>\n${body}\n</${tag}>`];
}

function questionLabel(turn: Pick<AnsweredTurn, "index" | "question">): string {
  const { followUpOf } = turn.question;
  const suffix = followUpOf === undefined ? "" : ` (follow-up to question ${String(followUpOf + 1)})`;
  return `Question ${String(turn.index + 1)}${suffix}: ${turn.question.text}`;
}

function transcript(turns: readonly EvaluatedTurn[]): string | undefined {
  return turns.length === 0
    ? undefined
    : turns.map((turn) => `${questionLabel(turn)}\nAnswer: ${turn.answer.text}`).join("\n\n");
}

function request<T>(format: ResponseFormat<T>, system: readonly string[], user: readonly string[]): ModelRequest {
  return {
    system: system.join("\n"),
    user: user.join("\n\n"),
    response: { name: format.name, schema: format.schema },
  };
}

function taskInstruction(task: QuestionTask): string {
  if (task.kind === "generated") {
    return [
      `Write the next primary question, grounded in ${SOURCE_LABELS[task.source]}.`,
      "Target a competency the transcript has not covered yet.",
      "If that material is missing, base the question on the role and competencies.",
    ].join(" ");
  }
  const reasons = task.triggers.map((trigger) => FOLLOW_UP_TRIGGER_MEANINGS[trigger]).join("; ");
  return `The answer to question ${String(task.of + 1)} was flagged: ${reasons}. Write one follow-up question that probes that answer.`;
}

/** How a voice interviewer phrases what it says aloud. */
const SPOKEN_QUESTION = [
  "Your words are read aloud by a voice interviewer and the candidate answers out loud.",
  "Write it as natural speech: at most two short sentences, no lists, markdown, brackets or abbreviations that read badly aloud.",
  "When there is a previous answer, you may open with a brief neutral acknowledgement such as \"Thanks.\" or \"Got it.\" before the question.",
].join(" ");

/** Prompt for the next interviewer question. */
export function questionRequest(
  { interview, profile, candidate }: InterviewContext,
  turns: readonly EvaluatedTurn[],
  task: QuestionTask,
): ModelRequest {
  return request(
    questionResponseFormat,
    [
      `You are an AI interviewer running a ${profile.format} screening interview for the role "${interview.role}".`,
      `Tone: ${profile.persona.tone}.`,
      ...(profile.persona.reactsEmotionally ? [] : ["Stay neutral: do not praise, reassure or react to answers."]),
      `Competencies assessed: ${interview.competencies.join(", ")}.`,
      ...(profile.turnTaking.answer === "spoken" ? [SPOKEN_QUESTION] : []),
      "Write exactly one question. Never answer it, give feedback, or reveal scores.",
      JSON_ONLY,
    ],
    [
      ...section("resume", candidate.resume),
      ...section("job_description", candidate.jobDescription),
      ...section("transcript", transcript(turns)),
      taskInstruction(task),
    ],
  );
}

/** The structured format an evaluation of this interview must follow. */
export function evaluationFormat({ rubric }: InterviewContext): ResponseFormat<TurnEvaluation> {
  return evaluationResponseFormat(rubric.criteria.map((criterion) => criterion.id));
}

function triggerGuidance(triggers: readonly FollowUpTrigger[]): string {
  return triggers.length === 0
    ? "Do not flag any follow-up triggers."
    : `Flag follow-up triggers only when clearly warranted. Allowed: ${triggers
        .map((trigger) => `${trigger} (${FOLLOW_UP_TRIGGER_MEANINGS[trigger]})`)
        .join("; ")}.`;
}

const SPOKEN_EVALUATION = [
  "The answer was spoken and transcribed, so fillers and false starts appear in it.",
  "Judge content criteria on substance, not on transcription noise.",
  "Judge delivery criteria (fluency, pace, concision) using the <delivery> measurements.",
].join(" ");

/** Prompt for a rubric evaluation of the answered turn. */
export function evaluationRequest(context: InterviewContext, answered: AnsweredTurn): ModelRequest {
  const { interview, profile, rubric } = context;
  const { delivery } = answered.answer;
  const { softSeconds, hardSeconds } = profile.timing.answer;
  const criteria = rubric.criteria.map((criterion) =>
    [
      `- ${criterion.id} (${criterion.label}, weight ${String(criterion.weight)})`,
      ...criterion.levels.map((level) => `  ${String(level.score)}: ${level.description}`),
    ].join("\n"),
  );
  return request(
    evaluationFormat(context),
    [
      `You are a strict, calibrated evaluator of interview answers for the role "${interview.role}".`,
      "Score every rubric criterion exactly once, from 1 (poor) to 5 (excellent), using the level descriptors.",
      triggerGuidance(profile.turnPolicy.followUpTriggers),
      ...(delivery === undefined ? [] : [SPOKEN_EVALUATION]),
      "Write a rationale of 2-4 specific sentences addressed to the candidate.",
      JSON_ONLY,
    ],
    [
      ...section("rubric", criteria.join("\n")),
      ...section("question", questionLabel(answered)),
      ...section("answer", answered.answer.text),
      ...section("delivery", delivery === undefined ? undefined : describeDelivery(delivery)),
      `Answered in ${String(Math.round(answered.elapsedMs / 1000))}s (soft limit ${String(softSeconds)}s, hard limit ${String(hardSeconds)}s, overtime: ${answered.overtime}).`,
    ],
  );
}
