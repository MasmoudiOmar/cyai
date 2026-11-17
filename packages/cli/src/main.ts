import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPracticeService,
  CYAI_VERSION,
  describeError,
  formatInterviewTable,
  formatSessionTable,
  summarizeInterviews,
  summarizeSession,
  type Clock,
  type IdGenerator,
  type PracticeService,
  type SessionStore,
  type TemplateCatalog,
  type TextModel,
} from "@cyai/core";
import { createModel, describeModel, type ModelSettings } from "@cyai/llm";
import { startStdioServer } from "@cyai/mcp";
import {
  createFileSessionStore,
  defaultDataDir,
  errorMessage,
  systemClock,
  templateDirectories,
  uuidGenerator,
} from "@cyai/node";
import { createApi, startWebServer, type ListenOptions, type RunningServer, type WebServerOptions } from "@cyai/server";
import { err, ok, type Result, type StartPractice } from "@cyai/spec";
import { describeLoadError, loadCatalog, type LoadCatalogError } from "@cyai/templates";

import { parseCommand, USAGE, type PracticeCommand, type UiCommand } from "./args.js";
import { detachedSpawn, openInBrowser } from "./browser.js";
import { practice } from "./practice.js";
import type { Terminal } from "./terminal.js";

/** Everything the CLI touches outside its own logic, so tests can replace it. */
export interface CliServices {
  readonly loadCatalog: (directories: readonly string[]) => Promise<Result<TemplateCatalog, LoadCatalogError>>;
  readonly createStore: (dataDir: string) => SessionStore;
  readonly createModel: (settings: ModelSettings, env: NodeJS.ProcessEnv) => Result<TextModel, string>;
  readonly readText: (path: string) => Promise<string>;
  readonly serveMcp: (env: NodeJS.ProcessEnv) => Promise<string | undefined>;
  /** Folder of the built web app, or why it is unavailable. */
  readonly webRoot: () => Promise<Result<string, string>>;
  readonly serveWeb: (options: WebServerOptions & ListenOptions) => Promise<Result<RunningServer, string>>;
  readonly openBrowser: (url: string) => Promise<boolean>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** `@cyai/web`'s build output, which sits next to its package.json. */
export async function builtWebRoot(
  packageJson: string = fileURLToPath(import.meta.resolve("@cyai/web/package.json")),
): Promise<Result<string, string>> {
  const root = join(dirname(packageJson), "dist");
  try {
    await access(join(root, "index.html"));
    return ok(root);
  } catch {
    return err(`The web app is not built (${root} is missing). Run \`pnpm build\` in the cyai repository.`);
  }
}

export const nodeServices: CliServices = {
  loadCatalog: (directories) => loadCatalog({ directories }),
  createStore: createFileSessionStore,
  createModel,
  readText: (path) => readFile(path, "utf8"),
  serveMcp: startStdioServer,
  webRoot: builtWebRoot,
  serveWeb: startWebServer,
  openBrowser: (url) => openInBrowser(url, { platform: process.platform, env: process.env, run: detachedSpawn }),
  clock: systemClock,
  ids: uuidGenerator,
};

export interface CliIO {
  readonly terminal: Terminal;
  readonly env: NodeJS.ProcessEnv;
  readonly services?: Partial<CliServices>;
}

/** Exit code, or `"serving"` while a server keeps the process alive. */
export type CliExit = number | "serving";

type Outcome = Result<CliExit, string>;

async function readCandidateFile(services: CliServices, path: string | undefined): Promise<Result<string | undefined, string>> {
  if (path === undefined) {
    return ok(undefined);
  }
  try {
    return ok(await services.readText(path));
  } catch (error) {
    return err(`Cannot read ${path}: ${errorMessage(error)}`);
  }
}

async function practiceInput(services: CliServices, command: PracticeCommand): Promise<Result<StartPractice, string>> {
  const resume = await readCandidateFile(services, command.resumeFile);
  if (!resume.ok) {
    return resume;
  }
  const jobDescription = await readCandidateFile(services, command.jobDescriptionFile);
  if (!jobDescription.ok) {
    return jobDescription;
  }
  return ok({ interviewId: command.interviewId, resume: resume.value, jobDescription: jobDescription.value });
}

/** The practice service a command needs: templates, the interviewer model and the session store. */
async function practiceService(
  services: CliServices,
  env: NodeJS.ProcessEnv,
  settings: ModelSettings,
): Promise<Result<PracticeService, string>> {
  const catalog = await services.loadCatalog(templateDirectories(env));
  if (!catalog.ok) {
    return err(describeLoadError(catalog.error));
  }
  const model = services.createModel(settings, env);
  if (!model.ok) {
    return model;
  }
  return ok(
    createPracticeService({
      catalog: catalog.value,
      store: services.createStore(defaultDataDir(env)),
      clock: services.clock,
      ids: services.ids,
      model: model.value,
    }),
  );
}

async function runPractice(services: CliServices, io: CliIO, command: PracticeCommand): Promise<Outcome> {
  const service = await practiceService(services, io.env, command.model);
  if (!service.ok) {
    return service;
  }
  const input = await practiceInput(services, command);
  if (!input.ok) {
    return input;
  }
  const outcome = await practice({ service: service.value, terminal: io.terminal }, input.value);
  return outcome.ok ? ok(0) : err(describeError(outcome.error));
}

async function runUi(services: CliServices, io: CliIO, command: UiCommand): Promise<Outcome> {
  const staticDir = await services.webRoot();
  if (!staticDir.ok) {
    return staticDir;
  }
  const service = await practiceService(services, io.env, command.model);
  if (!service.ok) {
    return service;
  }
  const api = createApi(service.value, { version: CYAI_VERSION, model: describeModel(command.model) });
  const server = await services.serveWeb({ api, staticDir: staticDir.value, port: command.port });
  if (!server.ok) {
    return server;
  }
  const { url } = server.value;
  io.terminal.write(`cyai is running at ${url}\nPress Ctrl+C to stop.\n`);
  if (command.open && !(await services.openBrowser(url))) {
    io.terminal.write(`Open ${url} in your browser.\n`);
  }
  return ok("serving");
}

async function dispatch(argv: readonly string[], services: CliServices, io: CliIO): Promise<Outcome> {
  const command = parseCommand(argv);
  if (!command.ok) {
    return err(`${command.error}\n\n${USAGE}`);
  }
  const print = (text: string): Outcome => {
    io.terminal.write(`${text}\n`);
    return ok(0);
  };
  switch (command.value.kind) {
    case "help":
      return print(USAGE);
    case "version":
      return print(CYAI_VERSION);
    case "mcp": {
      const failure = await services.serveMcp(io.env);
      return failure === undefined ? ok("serving") : err(failure);
    }
    case "history": {
      const records = await services.createStore(defaultDataDir(io.env)).list();
      return records.ok
        ? print(formatSessionTable(records.value.map(summarizeSession), "plain"))
        : err(describeError(records.error));
    }
    case "list": {
      const catalog = await services.loadCatalog(templateDirectories(io.env));
      return catalog.ok
        ? print(formatInterviewTable(summarizeInterviews(catalog.value), "plain"))
        : err(describeLoadError(catalog.error));
    }
    case "practice":
      return runPractice(services, io, command.value);
    case "ui":
      return runUi(services, io, command.value);
  }
}

/** Runs one CLI invocation. Writes errors to the terminal and returns the exit code. */
export async function runCli(argv: readonly string[], io: CliIO): Promise<CliExit> {
  const services: CliServices = { ...nodeServices, ...io.services };
  const outcome = await dispatch(argv, services, io);
  if (outcome.ok) {
    return outcome.value;
  }
  io.terminal.write(`cyai: ${outcome.error}\n`);
  return 1;
}
