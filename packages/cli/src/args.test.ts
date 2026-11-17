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
      provider: "anthropic",
    });
  });

  it("parses every practice option", () => {
    const argv = ["practice", "swe", "--resume", "cv.md", "--jd", "jd.md", "--provider", "openai", "--model", "llama3.2", "--base-url", "http://h/v1"];
    expect(unwrap(parseCommand(argv))).toEqual({
      kind: "practice",
      interviewId: "swe",
      provider: "openai",
      resumeFile: "cv.md",
      jobDescriptionFile: "jd.md",
      model: "llama3.2",
      baseUrl: "http://h/v1",
    });
    expect(unwrap(parseCommand(["practice", "swe", "--provider", "anthropic"]))).toMatchObject({ provider: "anthropic" });
  });

  it.each([
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
