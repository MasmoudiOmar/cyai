import { evaluation, genericProfile, spokenProfile } from "@cyai/fixtures";
import type { DeliveryMetrics } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import { drive, events, expectStatus, turn } from "../test-support/drive.js";
import { fixtureContext } from "../test-support/interview.js";
import { evaluationFormat, evaluationRequest, questionRequest } from "./prompts.js";

const answered = expectStatus(
  drive(events.start(0), ...turn(1, evaluation(3)), events.ask(40, 0), events.answer(100)),
  "awaiting_evaluation",
).answered;

describe("questionRequest", () => {
  it("grounds a generated question in candidate material and asks for JSON", () => {
    const request = questionRequest(fixtureContext(), [], { kind: "generated", source: "resume" });
    expect(request.system).toContain('screening interview for the role "AI Trainer"');
    expect(request.system).toContain("Stay neutral");
    expect(request.user).toContain("<resume>\nFive years annotating medical datasets.\n</resume>");
    expect(request.user).toContain("grounded in the candidate's resume");
    expect(request.user).not.toContain("<transcript>");
    expect(request.response.name).toBe("interview_question");
  });

  it("omits missing material and the neutrality rule for expressive personas", () => {
    const context = fixtureContext({
      candidate: {},
      profile: { ...genericProfile, persona: { tone: "warm", reactsEmotionally: true } },
    });
    const request = questionRequest(context, [], { kind: "generated", source: "job_description" });
    expect(request.system).not.toContain("Stay neutral");
    expect(request.user).not.toContain("<resume>");
    expect(request.user).toContain("grounded in the job description");
  });

  it("asks for speakable questions in spoken interviews", () => {
    const spoken = questionRequest(fixtureContext({ profile: spokenProfile }), [], { kind: "generated", source: "resume" });
    expect(spoken.system).toContain("read aloud by a voice interviewer");
    expect(questionRequest(fixtureContext(), [], { kind: "generated", source: "resume" }).system).not.toContain(
      "read aloud",
    );
  });

  it("asks a follow-up that cites the transcript and the flagged reasons", () => {
    const turns = expectStatus(drive(events.start(0), ...turn(1, evaluation(2))), "awaiting_question").turns;
    const request = questionRequest(fixtureContext(), turns, { kind: "follow_up", of: 0, triggers: ["vague"] });
    expect(request.user).toContain("<transcript>\nQuestion 1: Tell me about yourself.\nAnswer: An answer.\n</transcript>");
    expect(request.user).toContain("The answer to question 1 was flagged: the answer stays general");
  });
});

describe("evaluationRequest", () => {
  it("lists rubric levels, the follow-up question, timing and allowed triggers", () => {
    const request = evaluationRequest(fixtureContext(), answered);
    expect(request.user).toContain("- structure (Structure, weight 0.6)\n  1: No clear situation");
    expect(request.user).toContain("Question 2 (follow-up to question 1): Tell me about yourself.");
    expect(request.user).toContain("Answered in 60s (soft limit 120s, hard limit 180s, overtime: none).");
    expect(request.system).toContain("Allowed: vague (");
    expect(request.response.name).toBe("answer_evaluation");
  });

  it("adds delivery measurements for spoken answers", () => {
    const delivery: DeliveryMetrics = {
      words: 120,
      wordsPerMinute: 140,
      fillers: [{ word: "um", count: 4 }],
      fillersPerMinute: 2,
      repetitions: 1,
      pauseCount: 2,
      longestPauseMs: 3_200,
      latencyMs: 900,
      durationMs: 60_000,
      speakingShare: 0.9,
      transcriber: "whisper",
    };
    const request = evaluationRequest(fixtureContext(), { ...answered, answer: { ...answered.answer, delivery } });
    expect(request.system).toContain("The answer was spoken and transcribed");
    expect(request.user).toContain("<delivery>\nPace: 140 words per minute over 120 words.");
    expect(evaluationRequest(fixtureContext(), answered).user).not.toContain("<delivery>");
  });

  it("forbids triggers when the profile follows up on none", () => {
    const profile = { ...genericProfile, turnPolicy: { ...genericProfile.turnPolicy, followUpTriggers: [] } };
    expect(evaluationRequest(fixtureContext({ profile }), answered).system).toContain(
      "Do not flag any follow-up triggers.",
    );
  });

  it("restricts evaluations to the rubric's criteria", () => {
    expect(evaluationFormat(fixtureContext()).parse(evaluation(4)).ok).toBe(true);
    const unknown = { ...evaluation(4), scores: [{ criterionId: "charisma", score: 4 }] };
    expect(evaluationFormat(fixtureContext()).parse(unknown).ok).toBe(false);
  });
});
