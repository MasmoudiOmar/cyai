import { unwrap, unwrapErr } from "@cyai/fixtures";
import { describe, expect, it } from "vitest";

import { createModel, describeModel, providerOf, type ModelSettings } from "./settings.js";

const anthropic: ModelSettings = { provider: "anthropic" };
const ollama: ModelSettings = { provider: "openai", model: "llama3.2" };

describe("model settings", () => {
  it("parses providers", () => {
    expect(unwrap(providerOf(undefined))).toBe("anthropic");
    expect(unwrap(providerOf("anthropic"))).toBe("anthropic");
    expect(unwrap(providerOf("openai"))).toBe("openai");
    expect(unwrapErr(providerOf("gemini"))).toBe('Unknown provider "gemini". Use anthropic or openai.');
  });

  it("builds an Anthropic model with or without an explicit model id", () => {
    expect(typeof unwrap(createModel(anthropic, {})).generate).toBe("function");
    expect(typeof unwrap(createModel({ ...anthropic, model: "claude-sonnet-5-5" }, {})).generate).toBe("function");
  });

  it("requires a model id for OpenAI-compatible servers", () => {
    expect(unwrapErr(createModel({ provider: "openai" }, {}))).toBe("--provider openai needs --model, e.g. --model llama3.2");
  });

  it.each([{}, { OPENAI_API_KEY: "" }, { OPENAI_API_KEY: "sk-test" }])("builds an OpenAI-compatible model with env %j", (env) => {
    expect(typeof unwrap(createModel(ollama, env)).generate).toBe("function");
    expect(typeof unwrap(createModel({ ...ollama, baseUrl: "http://h/v1" }, env)).generate).toBe("function");
  });

  it("describes the interviewer model", () => {
    expect(describeModel(anthropic)).toBe("claude-opus-5-5");
    expect(describeModel({ ...anthropic, model: "claude-sonnet-5-5" })).toBe("claude-sonnet-5-5");
    expect(describeModel(ollama)).toBe("llama3.2 at http://localhost:11434/v1");
    expect(describeModel({ provider: "openai", baseUrl: "http://h/v1" })).toBe("(no model) at http://h/v1");
  });
});
