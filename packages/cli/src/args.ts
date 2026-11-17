import { parseArgs } from "node:util";

import { providerOf, type ModelSettings, type SpeechSettings } from "@cyai/llm";
import { errorMessage } from "@cyai/node";
import { DEFAULT_PORT } from "@cyai/server";
import { err, ok, type Result } from "@cyai/spec";

export interface PracticeCommand {
  readonly kind: "practice";
  readonly interviewId: string;
  readonly resumeFile?: string;
  readonly jobDescriptionFile?: string;
  readonly model: ModelSettings;
}

export interface UiCommand {
  readonly kind: "ui";
  readonly port: number;
  readonly open: boolean;
  readonly model: ModelSettings;
  readonly speech: SpeechSettings;
}

export type Command =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | { readonly kind: "list" }
  | { readonly kind: "history" }
  | { readonly kind: "mcp" }
  | PracticeCommand
  | UiCommand;

export const USAGE = `Usage: cyai <command> [options]

Commands:
  ui                           Open the practice app in your browser
  list                         List installed interviews
  practice <interview-id>      Practise an interview in this terminal
  history                      List past practice sessions
  mcp                          Serve cyai to an MCP client (Claude Code, Cursor, ...) over stdio

Practice options:
  --resume <file>              Your resume (text or markdown) to personalise questions
  --jd <file>                  The job description to personalise questions

Interviewer model (ui and practice):
  --provider <name>            anthropic (default) or openai (any OpenAI-compatible server, e.g. Ollama)
  --model <id>                 Model id (default for anthropic: claude-opus-5-5; required for openai)
  --base-url <url>             OpenAI-compatible base URL (default: http://localhost:11434/v1)

UI options:
  --port <number>              Port to listen on (default: ${String(DEFAULT_PORT)})
  --no-open                    Do not open a browser window

Spoken interviews (ui). Without these the browser's own speech recognition and voices are used:
  --stt-url <url>              OpenAI-compatible speech-to-text base URL (Whisper), e.g. http://localhost:8000/v1
  --stt-model <id>             Transcription model (default: whisper-1)
  --tts-url <url>              OpenAI-compatible text-to-speech base URL, e.g. http://localhost:8880/v1
  --tts-model <id>             Speech model (default: tts-1)
  --tts-voice <name>           Interviewer voice (default: alloy)

Environment:
  ANTHROPIC_API_KEY            Credentials for --provider anthropic (or run \`ant auth login\`)
  OPENAI_API_KEY               Optional bearer token for --provider openai and speech servers
  CYAI_SPEECH_API_KEY          Bearer token for speech servers, if different
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
  port: { type: "string" },
  "stt-url": { type: "string" },
  "stt-model": { type: "string" },
  "tts-url": { type: "string" },
  "tts-model": { type: "string" },
  "tts-voice": { type: "string" },
  "no-open": { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;

interface Values {
  readonly resume?: string;
  readonly jd?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly "base-url"?: string;
  readonly port?: string;
  readonly "stt-url"?: string;
  readonly "stt-model"?: string;
  readonly "tts-url"?: string;
  readonly "tts-model"?: string;
  readonly "tts-voice"?: string;
  readonly "no-open"?: boolean;
}

const MAX_PORT = 65_535;

function modelSettings(values: Values): Result<ModelSettings, string> {
  const provider = providerOf(values.provider);
  if (!provider.ok) {
    return provider;
  }
  return ok({
    provider: provider.value,
    ...(values.model === undefined ? {} : { model: values.model }),
    ...(values["base-url"] === undefined ? {} : { baseUrl: values["base-url"] }),
  });
}

/** `{ [key]: value }` when the option was given, `{}` otherwise. */
function option<K extends string>(key: K, value: string | undefined): Readonly<Partial<Record<K, string>>> {
  const entry: Partial<Record<K, string>> = {};
  if (value !== undefined) {
    entry[key] = value;
  }
  return entry;
}

function speechSettings(values: Values): Result<SpeechSettings, string> {
  const sttUrl = values["stt-url"];
  const ttsUrl = values["tts-url"];
  if (sttUrl === undefined && values["stt-model"] !== undefined) {
    return err("--stt-model needs --stt-url.");
  }
  if (ttsUrl === undefined && (values["tts-model"] !== undefined || values["tts-voice"] !== undefined)) {
    return err("--tts-model and --tts-voice need --tts-url.");
  }
  return ok({
    ...(sttUrl === undefined ? {} : { transcription: { baseUrl: sttUrl, ...option("model", values["stt-model"]) } }),
    ...(ttsUrl === undefined
      ? {}
      : {
          voice: { baseUrl: ttsUrl, ...option("model", values["tts-model"]), ...option("voice", values["tts-voice"]) },
        }),
  });
}

function portOf(value: string | undefined): Result<number, string> {
  if (value === undefined) {
    return ok(DEFAULT_PORT);
  }
  const port = Number(value);
  return /^\d+$/.test(value) && port <= MAX_PORT ? ok(port) : err(`--port must be a number from 0 to ${String(MAX_PORT)}.`);
}

function practiceCommand(interviewId: string | undefined, values: Values): Result<Command, string> {
  if (interviewId === undefined) {
    return err("practice needs an interview id. Run `cyai list` to see them.");
  }
  const model = modelSettings(values);
  if (!model.ok) {
    return model;
  }
  return ok({
    kind: "practice",
    interviewId,
    model: model.value,
    ...(values.resume === undefined ? {} : { resumeFile: values.resume }),
    ...(values.jd === undefined ? {} : { jobDescriptionFile: values.jd }),
  });
}

function uiCommand(values: Values): Result<Command, string> {
  const model = modelSettings(values);
  if (!model.ok) {
    return model;
  }
  const port = portOf(values.port);
  if (!port.ok) {
    return port;
  }
  const speech = speechSettings(values);
  return speech.ok
    ? ok({ kind: "ui", port: port.value, open: values["no-open"] !== true, model: model.value, speech: speech.value })
    : speech;
}

function parse(argv: readonly string[]): Result<{ readonly values: Values & { readonly help?: boolean; readonly version?: boolean }; readonly positionals: readonly string[] }, string> {
  try {
    return ok(parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true }));
  } catch (error) {
    return err(errorMessage(error));
  }
}

/** Parses command-line arguments (without the node and script paths). */
export function parseCommand(argv: readonly string[]): Result<Command, string> {
  const parsed = parse(argv);
  if (!parsed.ok) {
    return parsed;
  }
  const { values, positionals } = parsed.value;
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
    case "ui":
      return uiCommand(values);
    default:
      return err(`Unknown command "${name}".`);
  }
}
