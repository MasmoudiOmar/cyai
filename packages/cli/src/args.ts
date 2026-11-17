import { parseArgs } from "node:util";

import { errorMessage } from "@cyai/node";
import { err, ok, type Result } from "@cyai/spec";

export type Provider = "anthropic" | "openai";

export interface PracticeCommand {
  readonly kind: "practice";
  readonly interviewId: string;
  readonly resumeFile?: string;
  readonly jobDescriptionFile?: string;
  readonly provider: Provider;
  readonly model?: string;
  readonly baseUrl?: string;
}

export type Command =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | { readonly kind: "list" }
  | { readonly kind: "history" }
  | { readonly kind: "mcp" }
  | PracticeCommand;

export const USAGE = `Usage: cyai <command> [options]

Commands:
  list                         List installed interviews
  practice <interview-id>      Practise an interview in this terminal
  history                      List past practice sessions
  mcp                          Serve cyai to an MCP client (Claude Code, Cursor, ...) over stdio

Practice options:
  --resume <file>              Your resume (text or markdown) to personalise questions
  --jd <file>                  The job description to personalise questions
  --provider <name>            anthropic (default) or openai (any OpenAI-compatible server, e.g. Ollama)
  --model <id>                 Model id (default for anthropic: claude-opus-5-5; required for openai)
  --base-url <url>             OpenAI-compatible base URL (default: http://localhost:11434/v1)

Environment:
  ANTHROPIC_API_KEY            Credentials for --provider anthropic (or run \`ant auth login\`)
  OPENAI_API_KEY               Optional bearer token for --provider openai
  CYAI_HOME                    Where sessions are stored (default: ~/.cyai)
  CYAI_TEMPLATES               Extra template folders, separated like PATH

Global options:
  -h, --help                   Show this help
  -v, --version                Show the version`;

const OPTIONS = {
  resume: { type: "string" },
  jd: { type: "string" },
  provider: { type: "string" },
  model: { type: "string" },
  "base-url": { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;

function providerOf(value: string | undefined): Result<Provider, string> {
  if (value === undefined || value === "anthropic") {
    return ok("anthropic");
  }
  return value === "openai" ? ok("openai") : err(`Unknown provider "${value}". Use anthropic or openai.`);
}

function practiceCommand(
  interviewId: string | undefined,
  values: { readonly resume?: string; readonly jd?: string; readonly provider?: string; readonly model?: string; readonly "base-url"?: string },
): Result<Command, string> {
  if (interviewId === undefined) {
    return err("practice needs an interview id. Run `cyai list` to see them.");
  }
  const provider = providerOf(values.provider);
  if (!provider.ok) {
    return provider;
  }
  return ok({
    kind: "practice",
    interviewId,
    provider: provider.value,
    ...(values.resume === undefined ? {} : { resumeFile: values.resume }),
    ...(values.jd === undefined ? {} : { jobDescriptionFile: values.jd }),
    ...(values.model === undefined ? {} : { model: values.model }),
    ...(values["base-url"] === undefined ? {} : { baseUrl: values["base-url"] }),
  });
}

/** Parses command-line arguments (without the node and script paths). */
export function parseCommand(argv: readonly string[]): Result<Command, string> {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>;
  try {
    parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    return err(errorMessage(error));
  }
  const { values, positionals } = parsed;
  if (values.version === true) {
    return ok({ kind: "version" });
  }
  const [name, ...rest] = positionals;
  if (values.help === true || name === undefined || name === "help") {
    return ok({ kind: "help" });
  }
  switch (name) {
    case "list":
    case "history":
    case "mcp":
      return ok({ kind: name });
    case "practice":
      return practiceCommand(rest[0], values);
    default:
      return err(`Unknown command "${name}".`);
  }
}
