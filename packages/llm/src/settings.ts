import type { TextModel } from "@cyai/core";
import { err, ok, type Result } from "@cyai/spec";

import { createAnthropicModel, DEFAULT_ANTHROPIC_MODEL } from "./anthropic.js";
import { createOpenAICompatibleModel, DEFAULT_OPENAI_COMPATIBLE_BASE_URL } from "./openai-compatible.js";

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
