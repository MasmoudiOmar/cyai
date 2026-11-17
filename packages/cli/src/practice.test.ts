import { buildCatalog, createPracticeService, type TemplateCatalog } from "@cyai/core";
import { evaluationJson, manualClock, modelError, questionJson, scriptedModel, type ScriptedReply } from "@cyai/core/test-support";
import { aiTrainerInterview, evaluation, SESSION_ID, spokenProfile, starRubric, unwrap, unwrapErr } from "@cyai/fixtures";
import { fixtureCatalog, memoryStore, type MemoryStore } from "@cyai/mcp/test-support";
import { describe, expect, it } from "vitest";

import { practice, QUIT_REASON, SPOKEN_IN_TERMINAL } from "./practice.js";
import { scriptedTerminal, type ScriptedTerminal } from "./test-support/terminal.js";

const COMPLETE_RUN: readonly ScriptedReply[] = [
  evaluationJson(evaluation(4)),
  questionJson("Which dataset was hardest?"),
  evaluationJson(evaluation(3)),
];

const input = { interviewId: "ai-trainer-generalist", resume: "Annotator." };

interface Setup {
  readonly run: () => ReturnType<typeof practice>;
  readonly store: MemoryStore;
  readonly terminal: ScriptedTerminal;
}

function setup(
  answers: readonly (string | undefined)[],
  replies: readonly ScriptedReply[] = [],
  catalog: TemplateCatalog = fixtureCatalog(),
): Setup {
  const store = memoryStore();
  const terminal = scriptedTerminal(answers);
  const service = createPracticeService({
    catalog,
    store,
    clock: manualClock(),
    ids: { next: () => SESSION_ID },
    model: scriptedModel(replies),
  });
  return { run: () => practice({ service, terminal }, input), store, terminal };
}

describe("practice", () => {
  it("runs the interview to a debrief and stores the completed session", async () => {
    const { run, store, terminal } = setup(["I escalated, then complied.", "The radiology set."], COMPLETE_RUN);
    expect(unwrap(await run())).toBe("completed");
    expect(store.records.get(SESSION_ID)).toMatchObject({ session: { status: "completed" }, candidate: { resume: "Annotator." } });
    const output = terminal.output();
    expect(output).toMatch(/^Practice interview: AI Trainer\n/);
    expect(output).toContain("Question 1 of up to 2\nTell me about a time you followed a guideline you disagreed with.\n");
    expect(output).toContain("(aim for 120s, hard limit 180s. Finish with an empty line; /quit to stop.)");
    expect(output).toContain("Question 2 of up to 2\nWhich dataset was hardest?\n");
    expect(output).toContain("Evaluating...\n");
    expect(output).toContain("## Interview complete: AI Trainer");
  });

  it("explains that spoken interviews are typed in the terminal", async () => {
    const spoken = unwrap(
      buildCatalog({
        profiles: [spokenProfile],
        rubrics: [starRubric],
        interviews: [{ ...aiTrainerInterview, profileId: spokenProfile.id }],
      }),
    );
    const { run, terminal } = setup([undefined], [], spoken);
    await run();
    expect(terminal.output()).toContain(`Practice interview: AI Trainer\n${SPOKEN_IN_TERMINAL}\n`);
    const typed = setup([undefined]);
    await typed.run();
    expect(typed.terminal.output()).not.toContain(SPOKEN_IN_TERMINAL);
  });

  it("labels follow-ups", async () => {
    const { run, terminal } = setup(["Vague.", undefined], [evaluationJson(evaluation(2, ["vague"])), questionJson("Can you be specific?")]);
    expect(unwrap(await run())).toBe("abandoned");
    expect(terminal.output()).toContain("Question 2 of up to 2 (follow-up)\nCan you be specific?\n");
  });

  it("mentions preparation time when the interviewer gives some", async () => {
    const catalog = fixtureCatalog();
    const prepared = new Map([...catalog.profiles].map(([id, profile]) => [id, { ...profile, timing: { ...profile.timing, prepSeconds: 30 } }]));
    const { run, terminal } = setup([undefined], [], { ...catalog, profiles: prepared });
    unwrap(await run());
    expect(terminal.output()).toContain("(30s to prepare, then aim for 120s");
  });

  it("saves the session as abandoned when the candidate quits", async () => {
    const { run, store, terminal } = setup([undefined]);
    expect(unwrap(await run())).toBe("abandoned");
    expect(store.records.get(SESSION_ID)?.session).toMatchObject({ status: "abandoned", reason: QUIT_REASON });
    expect(terminal.output()).toContain(`Stopped. Session ${SESSION_ID} was saved as abandoned.`);
  });

  it("reports model and storage failures", async () => {
    const failing = setup(["Answer."], [modelError("overloaded")]);
    expect(unwrapErr(await failing.run())).toMatchObject({ code: "model_error", message: "overloaded" });
    const full = setup([]);
    full.store.failing.add("save");
    expect(unwrapErr(await full.run())).toMatchObject({ code: "store_error" });
  });
});
