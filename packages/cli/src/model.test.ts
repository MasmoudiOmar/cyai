import { unwrap, unwrapErr } from "@cyai/fixtures";
import { describe, expect, it } from "vitest";

import type { PracticeCommand } from "./args.js";
import { modelFor } from "./model.js";

const base: PracticeCommand = { kind: "practice", interviewId: "swe", provider: "anthropic" };

describe("modelFor", () => {
  it("builds an Anthropic model with or without an explicit model id", () => {
    expect(typeof unwrap(modelFor(base, {})).generate).toBe("function");
    expect(typeof unwrap(modelFor({ ...base, model: "claude-sonnet-5-5" }, {})).generate).toBe("function");
  });

  it("requires a model id for OpenAI-compatible servers", () => {
    expect(unwrapErr(modelFor({ ...base, provider: "openai" }, {}))).toBe(
      "--provider openai needs --model, e.g. --model llama3.2",
    );
  });

  it.each([{}, { OPENAI_API_KEY: "" }, { OPENAI_API_KEY: "sk-test" }])("builds an OpenAI-compatible model with env %j", (env) => {
    const command: PracticeCommand = { ...base, provider: "openai", model: "llama3.2" };
    expect(typeof unwrap(modelFor(command, env)).generate).toBe("function");
    expect(typeof unwrap(modelFor({ ...command, baseUrl: "http://h/v1" }, env)).generate).toBe("function");
  });
});
