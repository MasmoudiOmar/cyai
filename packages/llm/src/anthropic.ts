import Anthropic from "@anthropic-ai/sdk";
import type { ModelError, TextModel } from "@cyai/core";
import { errorMessage } from "@cyai/node";
import { err, ok, type Result } from "@cyai/spec";

import { failureForStatus, modelError } from "./failures.js";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/** Server-side refusal fallback: Anthropic picks the fallback model per refusal category. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicModelOptions {
  /** Defaults to a client that reads credentials from the environment (`ANTHROPIC_API_KEY`, `ant auth login`). */
  readonly client?: Anthropic;
  readonly model?: string;
  /** Interview turns are short and judgement-heavy; `high` keeps evaluations careful. */
  readonly effort?: AnthropicEffort;
  readonly maxTokens?: number;
}

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;

/** Extracts the JSON text from a response, or explains why there is none. */
export function messageText(message: BetaMessage): Result<string, ModelError> {
  if (message.stop_reason === "refusal") {
    const explanation = message.stop_details?.explanation ?? "The model declined this request.";
    return err(modelError("refused", explanation));
  }
  if (message.stop_reason === "max_tokens") {
    return err(modelError("failed", "The response was cut off at the token limit."));
  }
  const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  return text.length > 0 ? ok(text) : err(modelError("failed", "The response contained no text."));
}

function toModelError(error: unknown): ModelError {
  if (!(error instanceof Anthropic.APIError)) {
    return modelError("failed", errorMessage(error));
  }
  const status: unknown = error.status;
  return modelError(failureForStatus(typeof status === "number" ? status : undefined), error.message);
}

/** Claude via the Anthropic API, with structured JSON output and refusal fallbacks enabled. */
export function createAnthropicModel(options: AnthropicModelOptions = {}): TextModel {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? DEFAULT_ANTHROPIC_MODEL;
  return {
    generate: async (request): Promise<Result<string, ModelError>> => {
      try {
        const message = await client.beta.messages.create({
          model,
          max_tokens: options.maxTokens ?? 16_000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: {
            effort: options.effort ?? "high",
            format: { type: "json_schema", schema: request.response.schema },
          },
          system: request.system,
          messages: [{ role: "user", content: request.user }],
        });
        return messageText(message);
      } catch (error) {
        return err(toModelError(error));
      }
    },
  };
}
