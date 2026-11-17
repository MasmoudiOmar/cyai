import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CYAI_VERSION } from "@cyai/core";
import { evaluationJson, questionJson, scriptedModel } from "@cyai/core/test-support";
import { evaluation, SESSION_ID } from "@cyai/fixtures";
import { fixtureCatalog, memoryStore } from "@cyai/mcp/test-support";
import type { WebServerOptions } from "@cyai/server";
import { err, ok } from "@cyai/spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { builtWebRoot, nodeServices, runCli, type CliExit, type CliServices } from "./main.js";
import { scriptedTerminal, type ScriptedTerminal } from "./test-support/terminal.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "cyai-cli-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
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
const failingCatalog: CliServices["loadCatalog"] = () =>
  Promise.resolve(err({ code: "template_load_error", file: "x.yaml", message: "bad" }));

const fakePractice: Partial<CliServices> = {
  loadCatalog: loadFixtureCatalog,
  createModel: () => ok(scriptedModel([evaluationJson(evaluation(4)), questionJson("Why?"), evaluationJson(evaluation(4))])),
  ids: { next: () => SESSION_ID },
};

const URL = "http://localhost:4477";

function fakeWeb(opened: boolean, served: WebServerOptions[] = []): Partial<CliServices> {
  return {
    ...fakePractice,
    webRoot: () => Promise.resolve(ok("/web")),
    serveWeb: (options): ReturnType<CliServices["serveWeb"]> => {
      served.push(options);
      return Promise.resolve(ok({ url: URL, close: () => Promise.resolve() }));
    },
    openBrowser: () => Promise.resolve(opened),
  };
}

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

  it("lists installed interviews from the built-in templates as an aligned table", async () => {
    const { exit, terminal } = await run(["list"]);
    expect(exit).toBe(0);
    const [header, rule, ...rows] = terminal.output().trimEnd().split("\n");
    expect(header).toMatch(/^Interview id {2,}Role/);
    expect(rule).toMatch(/^-+ {2}-+/);
    expect(rows.some((row) => row.startsWith("ai-trainer-generalist"))).toBe(true);
  });

  it("reports template loading failures", async () => {
    const { exit, terminal } = await run(["list"], { loadCatalog: failingCatalog });
    expect([exit, terminal.output()]).toEqual([1, "cyai: x.yaml: bad\n"]);
  });

  it("lists past sessions and reports store failures", async () => {
    const empty = await run(["history"]);
    expect([empty.exit, empty.terminal.output()]).toEqual([0, "No practice sessions yet.\n"]);
    const store = memoryStore();
    store.failing.add("list");
    const failed = await run(["history"], { createStore: () => store });
    expect([failed.exit, failed.terminal.output()]).toEqual([1, "cyai: Session storage failed (io): disk full\n"]);
  });

  it("practises an interview with resume and job description files, then shows it in the history", async () => {
    const resume = join(home, "resume.md");
    const jd = join(home, "jd.md");
    await writeFile(resume, "  Annotator for five years.\n");
    await writeFile(jd, "Rank model outputs.");
    const practised = await run(["practice", "ai-trainer-generalist", "--resume", resume, "--jd", jd], fakePractice, ["One.", "Two."]);
    expect(practised.exit).toBe(0);
    expect(practised.terminal.output()).toContain("Question 2 of up to 2\nWhy?");
    const history = await run(["history"]);
    expect(history.terminal.output()).toContain(SESSION_ID);
  });

  it("practises without candidate files", async () => {
    expect((await run(["practice", "ai-trainer-generalist"], fakePractice, [undefined])).exit).toBe(0);
  });

  it("reports model, template, file and interview problems", async () => {
    const noModel = await run(["practice", "ai-trainer-generalist", "--provider", "openai"], { loadCatalog: loadFixtureCatalog });
    expect([noModel.exit, noModel.terminal.output()]).toEqual([1, "cyai: --provider openai needs --model, e.g. --model llama3.2\n"]);

    const noTemplates = await run(["practice", "ai-trainer-generalist"], { loadCatalog: failingCatalog });
    expect(noTemplates.terminal.output()).toBe("cyai: x.yaml: bad\n");

    const missing = join(home, "missing.md");
    for (const flag of ["--resume", "--jd"]) {
      const unreadable = await run(["practice", "ai-trainer-generalist", flag, missing], fakePractice);
      expect(unreadable.exit).toBe(1);
      expect(unreadable.terminal.output()).toContain(`cyai: Cannot read ${missing}: ENOENT`);
    }

    const unknown = await run(["practice", "nope"], fakePractice);
    expect([unknown.exit, unknown.terminal.output()]).toEqual([1, 'cyai: Unknown interview "nope".\n']);
  });

  it("starts the web app and opens a browser", async () => {
    const served: WebServerOptions[] = [];
    const ui = await run(["ui", "--port", "0"], fakeWeb(true, served));
    expect(ui.exit).toBe("serving");
    expect(ui.terminal.output()).toBe(`cyai is running at ${URL}\nPress Ctrl+C to stop.\n`);
    expect(served[0]?.staticDir).toBe("/web");
    const info = await served[0]?.api({ method: "GET", path: "/info", body: undefined });
    expect(info).toEqual({
      status: 200,
      body: { version: CYAI_VERSION, model: "claude-opus-5-5", voice: { transcription: "browser", voice: "browser" } },
    });
  });

  it("serves spoken interviews through the configured speech servers", async () => {
    const served: WebServerOptions[] = [];
    await run(["ui", "--stt-url", "http://localhost:8000/v1", "--tts-url", "http://localhost:8880/v1"], fakeWeb(true, served));
    const info = await served[0]?.api({ method: "GET", path: "/info", body: undefined });
    expect(info).toMatchObject({ body: { voice: { transcription: "whisper", voice: "endpoint" } } });
  });

  it("prints the address when no browser opens, and can skip opening one", async () => {
    expect((await run(["ui"], fakeWeb(false))).terminal.output()).toContain(`Open ${URL} in your browser.`);
    let opened = false;
    const quiet = await run(["ui", "--no-open"], {
      ...fakeWeb(true),
      openBrowser: () => {
        opened = true;
        return Promise.resolve(true);
      },
    });
    expect([quiet.exit, opened]).toEqual(["serving", false]);
  });

  it("reports why the web app cannot start", async () => {
    const unbuilt = await run(["ui"], { ...fakeWeb(true), webRoot: () => Promise.resolve(err("not built")) });
    expect([unbuilt.exit, unbuilt.terminal.output()]).toEqual([1, "cyai: not built\n"]);
    const noTemplates = await run(["ui"], { ...fakeWeb(true), loadCatalog: failingCatalog });
    expect(noTemplates.terminal.output()).toBe("cyai: x.yaml: bad\n");
    const busy = await run(["ui"], { ...fakeWeb(true), serveWeb: () => Promise.resolve(err("port in use")) });
    expect([busy.exit, busy.terminal.output()]).toEqual([1, "cyai: port in use\n"]);
  });
});

describe("node services", () => {
  it("finds the built web app next to its package.json", async () => {
    const packageJson = join(home, "package.json");
    expect(await builtWebRoot(packageJson)).toEqual(
      err(`The web app is not built (${join(home, "dist")} is missing). Run \`pnpm build\` in the cyai repository.`),
    );
    await mkdir(join(home, "dist"));
    await writeFile(join(home, "dist", "index.html"), "<!doctype html>");
    expect(await builtWebRoot(packageJson)).toEqual(ok(join(home, "dist")));
    expect(typeof (await builtWebRoot()).ok).toBe("boolean");
  });

  it("opens the browser named by $BROWSER", async () => {
    vi.stubEnv("BROWSER", process.execPath);
    await expect(nodeServices.openBrowser(URL)).resolves.toBe(true);
  });
});
