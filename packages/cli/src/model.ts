import type { TextModel } from "@cyai/core";
import { createAnthropicModel, createOpenAICompatibleModel } from "@cyai/llm";
import { err, ok, type Result } from "@cyai/spec";

import type { PracticeCommand } from "./args.js";

/** The model for a practice command. Credentials come from the environment, never from arguments. */
export function modelFor(command: PracticeCommand, env: NodeJS.ProcessEnv): Result<TextModel, string> {
  if (command.provider === "anthropic") {
    return ok(createAnthropicModel(command.model === undefined ? {} : { model: command.model }));
  }
  if (command.model === undefined) {
    return err("--provider openai needs --model, e.g. --model llama3.2");
  }
  const apiKey = env["OPENAI_API_KEY"];
  return ok(
    createOpenAICompatibleModel({
      model: command.model,
      ...(command.baseUrl === undefined ? {} : { baseUrl: command.baseUrl }),
      ...(apiKey === undefined || apiKey.length === 0 ? {} : { apiKey }),
    }),
  );
}
