import { at, evaluation, scorecardOf } from "@cyai/fixtures";
import { describe, expect, it } from "vitest";

import { drive, events, expectStatus, newSession, turn, unwrapErr } from "../test-support/drive.js";
import { transition } from "./machine.js";

const scorecard = scorecardOf(4);

const oneTurnScored = [events.start(0), ...turn(1, evaluation(4)), events.finish(40)];

describe("transition", () => {
  it("runs a full session from creation to completion", () => {
    const completed = expectStatus(drive(...oneTurnScored, events.complete(scorecard)), "completed");
    expect(completed).toMatchObject({ startedAt: at(0), endedAt: at(40), scorecard });
    expect(completed.turns).toHaveLength(1);
  });

  it("records answer timing and overtime on the answered turn", () => {
    const soft = expectStatus(drive(events.start(0), events.ask(0), events.answer(150)), "awaiting_evaluation");
    expect(soft.answered).toMatchObject({ index: 0, elapsedMs: 150_000, overtime: "soft" });

    const hard = expectStatus(drive(events.start(0), events.ask(0), events.answer(200)), "awaiting_evaluation");
    expect(hard.answered.overtime).toBe("hard");
  });

  it("accepts a follow-up that targets an existing turn", () => {
    const session = expectStatus(
      drive(events.start(0), ...turn(1, evaluation(2)), events.ask(40, 0)),
      "awaiting_answer",
    );
    expect(session.pending.followUpOf).toBe(0);
  });

  it("rejects a follow-up that targets a missing turn", () => {
    expect(unwrapErr(transition(drive(events.start(0)), events.ask(1, 3)))).toEqual({
      code: "unknown_follow_up_target",
      followUpOf: 3,
      turnCount: 0,
    });
  });

  it("rejects events that are not valid in the current status", () => {
    expect(unwrapErr(transition(newSession(), events.answer(1)))).toEqual({
      code: "invalid_transition",
      from: "created",
      event: "answer",
    });
  });

  it("rejects events timestamped before the last activity", () => {
    expect(unwrapErr(transition(drive(events.start(10)), events.ask(5)))).toEqual({
      code: "clock_skew",
      earliest: at(10),
      received: at(5),
    });
  });

  it("measures skew from the latest answer once turns exist", () => {
    const session = drive(events.start(0), ...turn(1, evaluation(3)));
    expect(unwrapErr(transition(session, events.finish(20)))).toMatchObject({
      code: "clock_skew",
      earliest: at(31),
    });
  });

  describe("abandon", () => {
    it("abandons a session that never started", () => {
      const abandoned = expectStatus(drive(events.abandon(1)), "abandoned");
      expect(abandoned).toMatchObject({ turns: [], endedAt: at(1) });
      expect("startedAt" in abandoned).toBe(false);
    });

    it("keeps evaluated turns and drops an unevaluated answer", () => {
      const abandoned = expectStatus(
        drive(events.start(0), ...turn(1, evaluation(3)), events.ask(40), events.answer(50), events.abandon(60)),
        "abandoned",
      );
      expect(abandoned).toMatchObject({ startedAt: at(0), endedAt: at(60) });
      expect(abandoned.turns).toHaveLength(1);
    });

    it("abandons while awaiting an answer or while scoring", () => {
      expect(drive(events.start(0), events.ask(1), events.abandon(2)).status).toBe("abandoned");
      expect(drive(...oneTurnScored, events.abandon(41)).status).toBe("abandoned");
    });

    it.each([
      ["abandoned", [events.abandon(1)]],
      ["completed", [...oneTurnScored, events.complete(scorecard)]],
    ] as const)("cannot abandon a %s session", (from, history) => {
      expect(unwrapErr(transition(drive(...history), events.abandon(100)))).toEqual({
        code: "invalid_transition",
        from,
        event: "abandon",
      });
    });
  });
});
