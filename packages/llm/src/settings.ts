import type { SpeechServices, TextModel } from "@cyai/core";
import { err, ok, type Result } from "@cyai/spec";

import { createAnthropicModel, DEFAULT_ANTHROPIC_MODEL } from "./anthropic.js";
import { createOpenAICompatibleModel, DEFAULT_OPENAI_COMPATIBLE_BASE_URL } from "./openai-compatible.js";
import { createSpeechEndpoint, createWhisperTranscriber } from "./speech.js";

export type Provider = "anthropic" | "openai";

/** Which model plays the interviewer. Credentials come from the environment, never from settings. */
export interface ModelSettings {
  readonly provider: Provider;
  readonly model?: string;
  readonly baseUrl?: string;
}

export function providerOf(value: string | undefined): Result<Provider, string> {
  if (value === undefined || value === "anthropic") {
    return ok("anthropic");
  }
  return value === "openai" ? ok("openai") : err(`Unknown provider "${value}". Use anthropic or openai.`);
}

export function createModel(settings: ModelSettings, env: NodeJS.ProcessEnv): Result<TextModel, string> {
  if (settings.provider === "anthropic") {
    return ok(createAnthropicModel(settings.model === undefined ? {} : { model: settings.model }));
  }
  if (settings.model === undefined) {
    return err("--provider openai needs --model, e.g. --model llama3.2");
  }
  const apiKey = env["OPENAI_API_KEY"];
  return ok(
    createOpenAICompatibleModel({
      model: settings.model,
      ...(settings.baseUrl === undefined ? {} : { baseUrl: settings.baseUrl }),
      ...(apiKey === undefined || apiKey.length === 0 ? {} : { apiKey }),
    }),
  );
}

/** A short label such as "claude-opus-5-5" or "llama3.2 at http://localhost:11434/v1". */
export function describeModel(settings: ModelSettings): string {
  return settings.provider === "anthropic"
    ? (settings.model ?? DEFAULT_ANTHROPIC_MODEL)
    : `${settings.model ?? "(no model)"} at ${settings.baseUrl ?? DEFAULT_OPENAI_COMPATIBLE_BASE_URL}`;
}

/** Where speech-to-text and the interviewer's voice come from. Both are optional. */
export interface SpeechSettings {
  readonly transcription?: { readonly baseUrl: string; readonly model?: string };
  readonly voice?: { readonly baseUrl: string; readonly model?: string; readonly voice?: string };
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

/** Speech endpoints authenticate with `CYAI_SPEECH_API_KEY`, else `OPENAI_API_KEY`, else nothing (local servers). */
export function createSpeech(
  settings: SpeechSettings,
  env: NodeJS.ProcessEnv,
  fetch: typeof globalThis.fetch = globalThis.fetch,
): SpeechServices {
  const apiKey = nonEmpty(env["CYAI_SPEECH_API_KEY"]) ?? nonEmpty(env["OPENAI_API_KEY"]);
  const auth = apiKey === undefined ? { fetch } : { apiKey, fetch };
  const { transcription, voice } = settings;
  return {
    ...(transcription === undefined ? {} : { transcriber: createWhisperTranscriber({ ...transcription, ...auth }) }),
    ...(voice === undefined ? {} : { speaker: createSpeechEndpoint({ ...voice, ...auth }) }),
  };
}
