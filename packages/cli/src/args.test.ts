import { unwrap, unwrapErr } from "@cyai/fixtures";
import { describe, expect, it } from "vitest";

import { parseCommand } from "./args.js";

describe("parseCommand", () => {
  it.each([
    [[], "help"],
    [["help"], "help"],
    [["list", "--help"], "help"],
    [["-h"], "help"],
    [["practice", "-v"], "version"],
    [["--version"], "version"],
    [["list"], "list"],
    [["history"], "history"],
    [["mcp"], "mcp"],
  ])("parses %j as %s", (argv, kind) => {
    expect(unwrap(parseCommand(argv)).kind).toBe(kind);
  });

  it("parses a practice command with only the defaults", () => {
    expect(unwrap(parseCommand(["practice", "ai-trainer-generalist"]))).toEqual({
      kind: "practice",
      interviewId: "ai-trainer-generalist",
      model: { provider: "anthropic" },
    });
  });

  it("parses every practice option", () => {
    const argv = ["practice", "swe", "--resume", "cv.md", "--jd", "jd.md", "--provider", "openai", "--model", "llama3.2", "--base-url", "http://h/v1"];
    expect(unwrap(parseCommand(argv))).toEqual({
      kind: "practice",
      interviewId: "swe",
      resumeFile: "cv.md",
      jobDescriptionFile: "jd.md",
      model: { provider: "openai", model: "llama3.2", baseUrl: "http://h/v1" },
    });
  });

  it("parses the ui command with its defaults and options", () => {
    expect(unwrap(parseCommand(["ui"]))).toEqual({ kind: "ui", port: 4477, open: true, model: { provider: "anthropic" } });
    expect(unwrap(parseCommand(["ui", "--port", "0", "--no-open", "--model", "claude-sonnet-5-5"]))).toEqual({
      kind: "ui",
      port: 0,
      open: false,
      model: { provider: "anthropic", model: "claude-sonnet-5-5" },
    });
  });

  it.each([
    [["ui", "--provider", "gemini"], 'Unknown provider "gemini". Use anthropic or openai.'],
    [["ui", "--port", "http"], "--port must be a number from 0 to 65535."],
    [["ui", "--port", "70000"], "--port must be a number from 0 to 65535."],
    [["practice"], "practice needs an interview id. Run `cyai list` to see them."],
    [["practice", "swe", "--provider", "gemini"], 'Unknown provider "gemini". Use anthropic or openai.'],
    [["dance"], 'Unknown command "dance".'],
  ])("rejects %j", (argv, message) => {
    expect(unwrapErr(parseCommand(argv))).toBe(message);
  });

  it("rejects unknown options", () => {
    expect(unwrapErr(parseCommand(["list", "--colour"]))).toContain("--colour");
  });
});
