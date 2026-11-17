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

const chunkSchema = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string().nullish(),
      delta: z.object({ content: z.string().nullish(), refusal: z.string().nullish() }),
    }),
  ),
});

function unexpected(error: z.ZodError): ModelError {
  return modelError("failed", `Unexpected response: ${describeIssues(error)}`);
}

function parseJson(text: string): Result<unknown, ModelError> {
  try {
    const value: unknown = JSON.parse(text);
    return ok(value);
  } catch {
    return err(modelError("failed", "The response is not valid JSON."));
  }
}

/**
 * Folds a streamed (server-sent events) chat completion into the shape of a plain one.
 * Streaming keeps slow local models from hitting fetch's 300-second wait for the first byte.
 * A server that ignores `stream` and answers with one JSON body is accepted too.
 */
export function collectCompletion(text: string): Result<unknown, ModelError> {
  const events = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((data) => data !== "[DONE]");
  if (events.length === 0) {
    return parseJson(text);
  }
  let content = "";
  let refusal = "";
  let finishReason: string | null = null;
  for (const data of events) {
    const json = parseJson(data);
    if (!json.ok) {
      return json;
    }
    const chunk = chunkSchema.safeParse(json.value);
    if (!chunk.success) {
      return err(unexpected(chunk.error));
    }
    for (const choice of chunk.data.choices.slice(0, 1)) {
      content += choice.delta.content ?? "";
      refusal += choice.delta.refusal ?? "";
      finishReason = choice.finish_reason ?? finishReason;
    }
  }
  return ok({ choices: [{ finish_reason: finishReason, message: { content, refusal } }] });
}

/** Extracts the JSON text from a chat-completions response body. */
export function completionText(body: unknown): Result<string, ModelError> {
  const parsed = completionSchema.safeParse(body);
  if (!parsed.success) {
    return err(unexpected(parsed.error));
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
            stream: true,
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
      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        return err(modelError("unavailable", errorMessage(error)));
      }
      const body = collectCompletion(text);
      return body.ok ? completionText(body.value) : body;
    },
  };
}
