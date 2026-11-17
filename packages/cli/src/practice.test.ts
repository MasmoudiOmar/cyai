import { evaluationJson, manualClock, modelError, questionJson, scriptedModel, type ScriptedReply } from "@cyai/core/test-support";
import { evaluation, SESSION_ID, unwrap, unwrapErr } from "@cyai/fixtures";
import { fixtureCatalog, memoryStore, type MemoryStore } from "@cyai/mcp/test-support";
import type { Clock } from "@cyai/core";
import { describe, expect, it } from "vitest";

import { practice, type PracticeDeps } from "./practice.js";
import { scriptedTerminal, type ScriptedTerminal } from "./test-support/terminal.js";

const COMPLETE_RUN: readonly ScriptedReply[] = [
  evaluationJson(evaluation(4)),
  questionJson("Which dataset was hardest?"),
  evaluationJson(evaluation(3)),
];

interface Setup {
  readonly deps: PracticeDeps;
  readonly store: MemoryStore;
  readonly terminal: ScriptedTerminal;
}

function setup(answers: readonly (string | undefined)[], replies: readonly ScriptedReply[] = [], clock: Clock = manualClock()): Setup {
  const store = memoryStore();
  const terminal = scriptedTerminal(answers);
  const deps: PracticeDeps = {
    catalog: fixtureCatalog(),
    store,
    terminal,
    clock,
    ids: { next: () => SESSION_ID },
    model: scriptedModel(replies),
  };
  return { deps, store, terminal };
}

const input = { interviewId: "ai-trainer-generalist", candidate: { resume: "Annotator." } };

describe("practice", () => {
  it("runs the interview to a debrief and stores the completed session", async () => {
    const { deps, store, terminal } = setup(["I escalated, then complied.", "The radiology set."], COMPLETE_RUN);
    expect(unwrap(await practice(deps, input))).toBe("completed");
    expect(store.records.get(SESSION_ID)).toMatchObject({ session: { status: "completed" }, candidate: input.candidate });
    const output = terminal.output();
    expect(output).toContain("AI Trainer: Adaptive AI Interviewer (generic)\n");
    expect(output).toContain("Question 1\nTell me about a time you followed a guideline you disagreed with.\n");
    expect(output).toContain("(aim for 120s, hard limit 180s. Finish with an empty line; /quit to stop.)");
    expect(output).toContain("Question 2\nWhich dataset was hardest?\n");
    expect(output).toContain("Evaluating...\n");
  });

  it("labels follow-ups and preparation time", async () => {
    const catalog = fixtureCatalog();
    const profile = catalog.profiles.get("live-adaptive-generic");
    if (profile === undefined) {
      throw new Error("missing profile");
    }
    const prepared = { ...profile, timing: { ...profile.timing, prepSeconds: 30 } };
    const { deps, terminal } = setup(["Vague.", undefined], [evaluationJson(evaluation(2, ["vague"])), questionJson("Can you be specific?")]);
    const withPrep: PracticeDeps = { ...deps, catalog: { ...catalog, profiles: new Map([[prepared.id, prepared]]) } };
    expect(unwrap(await practice(withPrep, input))).toBe("abandoned");
    expect(terminal.output()).toContain("Question 2 (follow-up)\nCan you be specific?\n(30s to prepare, then aim for 120s");
  });

  it("saves the session as abandoned when the candidate quits", async () => {
    const { deps, store, terminal } = setup([undefined]);
    expect(unwrap(await practice(deps, input))).toBe("abandoned");
    expect(store.records.get(SESSION_ID)?.session).toMatchObject({ status: "abandoned", reason: "Quit from the terminal." });
    expect(terminal.output()).toContain(`Stopped. Session ${SESSION_ID} was saved as abandoned.`);
  });

  it("reports unknown interviews and model failures", async () => {
    expect(unwrapErr(await practice(setup([]).deps, { ...input, interviewId: "nope" }))).toMatchObject({ code: "unknown_template" });
    const { deps } = setup(["Answer."], [modelError("overloaded")]);
    expect(unwrapErr(await practice(deps, input))).toMatchObject({ code: "model_error", message: "overloaded" });
  });

  it("stops when a save fails", async () => {
    const first = setup(["Answer."]);
    first.store.failing.add("save");
    expect(unwrapErr(await practice(first.deps, input))).toMatchObject({ code: "store_error" });

    const quitting = setup([undefined]);
    const flaky: PracticeDeps = {
      ...quitting.deps,
      store: {
        ...quitting.store,
        save: (record): ReturnType<MemoryStore["save"]> => {
          const saved = quitting.store.save(record);
          quitting.store.failing.add("save");
          return saved;
        },
      },
    };
    expect(unwrapErr(await practice(flaky, input))).toMatchObject({ code: "store_error" });
  });

  it("reports a clock that runs backwards while quitting", async () => {
    const clock = manualClock(10);
    const { deps, terminal } = setup([undefined], [], clock);
    const rewinding: PracticeDeps = {
      ...deps,
      terminal: {
        ...terminal,
        readAnswer: (): Promise<string | undefined> => {
          clock.set(0);
          return terminal.readAnswer();
        },
      },
    };
    expect(unwrapErr(await practice(rewinding, input))).toMatchObject({ code: "clock_skew" });
  });
});
