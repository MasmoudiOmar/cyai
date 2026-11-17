import type { ModelError, TextModel } from "@cyai/core";
import { errorMessage } from "@cyai/node";
import { describeIssues, err, ok, type Result } from "@cyai/spec";
import { z } from "zod";

import { failureForStatus, modelError } from "./failures.js";

/** Ollama's OpenAI-compatible endpoint. */
export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "http://localhost:11434/v1";

export interface OpenAICompatibleModelOptions {
  readonly model: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly fetch?: typeof globalThis.fetch;
}

const choiceSchema = z.object({
  finish_reason: z.string().nullish(),
  message: z.object({ content: z.string().nullish(), refusal: z.string().nullish() }),
});

/** At least one choice; only the first is used. */
const completionSchema = z.object({ choices: z.tuple([choiceSchema], choiceSchema) });

/** Extracts the JSON text from a chat-completions response body. */
export function completionText(body: unknown): Result<string, ModelError> {
  const parsed = completionSchema.safeParse(body);
  if (!parsed.success) {
    return err(modelError("failed", `Unexpected response: ${describeIssues(parsed.error)}`));
  }
  const [choice] = parsed.data.choices;
  const { refusal } = choice.message;
  if (refusal !== undefined && refusal !== null && refusal.length > 0) {
    return err(modelError("refused", refusal));
  }
  if (choice.finish_reason === "length") {
    return err(modelError("failed", "The response was cut off at the token limit."));
  }
  const content = choice.message.content ?? "";
  return content.length > 0 ? ok(content) : err(modelError("failed", "The response contained no text."));
}

/** Any server speaking the OpenAI chat-completions protocol, with JSON-schema structured output. */
export function createOpenAICompatibleModel(options: OpenAICompatibleModelOptions): TextModel {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const url = `${(options.baseUrl ?? DEFAULT_OPENAI_COMPATIBLE_BASE_URL).replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.apiKey !== undefined) {
    headers["authorization"] = `Bearer ${options.apiKey}`;
  }
  return {
    generate: async (request): Promise<Result<string, ModelError>> => {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: options.model,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: request.response.name, schema: request.response.schema, strict: true },
            },
          }),
        });
      } catch (error) {
        return err(modelError("unavailable", errorMessage(error)));
      }
      if (!response.ok) {
        return err(modelError(failureForStatus(response.status), `${String(response.status)} ${await response.text()}`));
      }
      try {
        const body: unknown = await response.json();
        return completionText(body);
      } catch (error) {
        return err(modelError("failed", errorMessage(error)));
      }
    },
  };
}
