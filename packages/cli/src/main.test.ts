import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluationJson, questionJson, scriptedModel } from "@cyai/core/test-support";
import { CYAI_VERSION } from "@cyai/core";
import { err, ok } from "@cyai/spec";
import { evaluation, SESSION_ID } from "@cyai/fixtures";
import { fixtureCatalog, memoryStore } from "@cyai/mcp/test-support";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli, type CliExit, type CliServices } from "./main.js";
import { scriptedTerminal, type ScriptedTerminal } from "./test-support/terminal.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "cyai-cli-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

interface Run {
  readonly exit: CliExit;
  readonly terminal: ScriptedTerminal;
}

async function run(argv: readonly string[], services: Partial<CliServices> = {}, answers: readonly (string | undefined)[] = []): Promise<Run> {
  const terminal = scriptedTerminal(answers);
  const exit = await runCli(argv, { terminal, env: { CYAI_HOME: home }, services });
  return { exit, terminal };
}

const loadFixtureCatalog: CliServices["loadCatalog"] = () => Promise.resolve(ok(fixtureCatalog()));

const fakePractice: Partial<CliServices> = {
  loadCatalog: loadFixtureCatalog,
  createModel: () => ok(scriptedModel([evaluationJson(evaluation(4)), questionJson("Why?"), evaluationJson(evaluation(4))])),
  ids: { next: () => SESSION_ID },
};

describe("runCli", () => {
  it("prints help, the version and usage errors", async () => {
    const help = await run(["help"]);
    expect(help.exit).toBe(0);
    expect(help.terminal.output()).toContain("Usage: cyai <command>");
    const version = await run(["--version"]);
    expect([version.exit, version.terminal.output()]).toEqual([0, `${CYAI_VERSION}\n`]);
    const bad = await run(["dance"]);
    expect(bad.exit).toBe(1);
    expect(bad.terminal.output()).toMatch(/^cyai: Unknown command "dance"\.\n\nUsage:/);
  });

  it("serves MCP or reports why it cannot", async () => {
    expect((await run(["mcp"], { serveMcp: () => Promise.resolve(undefined) })).exit).toBe("serving");
    const failed = await run(["mcp"], { serveMcp: () => Promise.resolve("no catalog") });
    expect([failed.exit, failed.terminal.output()]).toEqual([1, "cyai: no catalog\n"]);
  });

  it("lists installed interviews from the built-in templates", async () => {
    const { exit, terminal } = await run(["list"]);
    expect(exit).toBe(0);
    expect(terminal.output()).toContain("ai-trainer-generalist");
  });

  it("reports template loading failures", async () => {
    const { exit, terminal } = await run(["list"], {
      loadCatalog: () => Promise.resolve(err({ code: "template_load_error", file: "x.yaml", message: "bad" })),
    });
    expect([exit, terminal.output()]).toEqual([1, "cyai: x.yaml: bad\n"]);
  });

  it("lists past sessions and reports store failures", async () => {
    const empty = await run(["history"]);
    expect(empty.exit).toBe(0);
    const store = memoryStore();
    store.failing.add("list");
    const failed = await run(["history"], { createStore: () => store });
    expect([failed.exit, failed.terminal.output()]).toEqual([1, "cyai: Session storage failed (io): disk full\n"]);
  });

  it("practises an interview with resume and job description files, then shows it in the history", async () => {
    const resume = join(home, "resume.md");
    const jd = join(home, "jd.md");
    await writeFile(resume, "  Annotator for five years.\n");
    await writeFile(jd, "\n");
    const practised = await run(["practice", "ai-trainer-generalist", "--resume", resume, "--jd", jd], fakePractice, ["One.", "Two."]);
    expect(practised.exit).toBe(0);
    expect(practised.terminal.output()).toContain("Question 2\nWhy?");
    const history = await run(["history"]);
    expect(history.terminal.output()).toContain(SESSION_ID);
  });

  it("practises with only a job description, or with no candidate files", async () => {
    const jd = join(home, "jd.md");
    await writeFile(jd, "Rank model outputs.");
    expect((await run(["practice", "ai-trainer-generalist", "--jd", jd], fakePractice, [undefined])).exit).toBe(0);
    expect((await run(["practice", "ai-trainer-generalist"], fakePractice, [undefined])).exit).toBe(0);
  });

  it("reports model, file and interview problems", async () => {
    const noModel = await run(["practice", "ai-trainer-generalist", "--provider", "openai"], { loadCatalog: loadFixtureCatalog });
    expect([noModel.exit, noModel.terminal.output()]).toEqual([1, "cyai: --provider openai needs --model, e.g. --model llama3.2\n"]);

    const missing = join(home, "missing.md");
    for (const flag of ["--resume", "--jd"]) {
      const unreadable = await run(["practice", "ai-trainer-generalist", flag, missing], fakePractice);
      expect(unreadable.exit).toBe(1);
      expect(unreadable.terminal.output()).toContain(`cyai: Cannot read ${missing}: ENOENT`);
    }

    const unknown = await run(["practice", "nope"], fakePractice);
    expect(unknown.exit).toBe(1);
    expect(unknown.terminal.output()).toContain("cyai: ");
  });
});
