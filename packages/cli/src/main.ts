import { readFile } from "node:fs/promises";

import {
  CYAI_VERSION,
  describeError,
  formatInterviewTable,
  formatSessionTable,
  summarizeInterviews,
  summarizeSession,
  type Clock,
  type IdGenerator,
  type SessionStore,
  type TemplateCatalog,
  type TextModel,
} from "@cyai/core";
import { startStdioServer } from "@cyai/mcp";
import {
  createFileSessionStore,
  defaultDataDir,
  errorMessage,
  systemClock,
  templateDirectories,
  uuidGenerator,
} from "@cyai/node";
import { err, ok, type CandidateContext, type Result } from "@cyai/spec";
import { describeLoadError, loadCatalog, type LoadCatalogError } from "@cyai/templates";

import { parseCommand, USAGE, type PracticeCommand } from "./args.js";
import { modelFor } from "./model.js";
import { practice } from "./practice.js";
import type { Terminal } from "./terminal.js";

/** Everything the CLI touches outside its own logic, so tests can replace it. */
export interface CliServices {
  readonly loadCatalog: (directories: readonly string[]) => Promise<Result<TemplateCatalog, LoadCatalogError>>;
  readonly createStore: (dataDir: string) => SessionStore;
  readonly createModel: (command: PracticeCommand, env: NodeJS.ProcessEnv) => Result<TextModel, string>;
  readonly readText: (path: string) => Promise<string>;
  readonly serveMcp: (env: NodeJS.ProcessEnv) => Promise<string | undefined>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export const nodeServices: CliServices = {
  loadCatalog: (directories) => loadCatalog({ directories }),
  createStore: createFileSessionStore,
  createModel: modelFor,
  readText: (path) => readFile(path, "utf8"),
  serveMcp: startStdioServer,
  clock: systemClock,
  ids: uuidGenerator,
};

export interface CliIO {
  readonly terminal: Terminal;
  readonly env: NodeJS.ProcessEnv;
  readonly services?: Partial<CliServices>;
}

/** Exit code, or `"serving"` while the MCP server keeps the process alive. */
export type CliExit = number | "serving";

async function readCandidateFile(services: CliServices, path: string | undefined): Promise<Result<string | undefined, string>> {
  if (path === undefined) {
    return ok(undefined);
  }
  try {
    const text = (await services.readText(path)).trim();
    return ok(text.length > 0 ? text : undefined);
  } catch (error) {
    return err(`Cannot read ${path}: ${errorMessage(error)}`);
  }
}

async function candidateFor(services: CliServices, command: PracticeCommand): Promise<Result<CandidateContext, string>> {
  const resume = await readCandidateFile(services, command.resumeFile);
  if (!resume.ok) {
    return resume;
  }
  const jobDescription = await readCandidateFile(services, command.jobDescriptionFile);
  if (!jobDescription.ok) {
    return jobDescription;
  }
  return ok({
    ...(resume.value === undefined ? {} : { resume: resume.value }),
    ...(jobDescription.value === undefined ? {} : { jobDescription: jobDescription.value }),
  });
}

/** Runs one CLI invocation. Writes errors to the terminal and returns the exit code. */
export async function runCli(argv: readonly string[], io: CliIO): Promise<CliExit> {
  const services: CliServices = { ...nodeServices, ...io.services };
  const fail = (message: string): number => {
    io.terminal.write(`cyai: ${message}\n`);
    return 1;
  };

  const command = parseCommand(argv);
  if (!command.ok) {
    return fail(`${command.error}\n\n${USAGE}`);
  }
  switch (command.value.kind) {
    case "help":
      io.terminal.write(`${USAGE}\n`);
      return 0;
    case "version":
      io.terminal.write(`${CYAI_VERSION}\n`);
      return 0;
    case "mcp": {
      const failure = await services.serveMcp(io.env);
      return failure === undefined ? "serving" : fail(failure);
    }
    case "history": {
      const records = await services.createStore(defaultDataDir(io.env)).list();
      if (!records.ok) {
        return fail(describeError(records.error));
      }
      io.terminal.write(`${formatSessionTable(records.value.map(summarizeSession))}\n`);
      return 0;
    }
    case "list":
    case "practice": {
      const catalog = await services.loadCatalog(templateDirectories(io.env));
      if (!catalog.ok) {
        return fail(describeLoadError(catalog.error));
      }
      if (command.value.kind === "list") {
        io.terminal.write(`${formatInterviewTable(summarizeInterviews(catalog.value))}\n`);
        return 0;
      }
      return runPractice(services, io, catalog.value, command.value);
    }
  }
}

async function runPractice(
  services: CliServices,
  io: CliIO,
  catalog: TemplateCatalog,
  command: PracticeCommand,
): Promise<number> {
  const model = services.createModel(command, io.env);
  if (!model.ok) {
    io.terminal.write(`cyai: ${model.error}\n`);
    return 1;
  }
  const candidate = await candidateFor(services, command);
  if (!candidate.ok) {
    io.terminal.write(`cyai: ${candidate.error}\n`);
    return 1;
  }
  const outcome = await practice(
    {
      catalog,
      store: services.createStore(defaultDataDir(io.env)),
      terminal: io.terminal,
      clock: services.clock,
      ids: services.ids,
      model: model.value,
    },
    { interviewId: command.interviewId, candidate: candidate.value },
  );
  if (!outcome.ok) {
    io.terminal.write(`cyai: ${describeError(outcome.error)}\n`);
    return 1;
  }
  return 0;
}
