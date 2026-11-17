import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { createStreamTerminal, QUIT_COMMAND } from "./terminal.js";

function streams(input: string): { readonly terminal: ReturnType<typeof createStreamTerminal>; readonly output: () => string } {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const chunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString("utf8"));
  });
  stdin.end(input);
  return { terminal: createStreamTerminal(stdin, stdout), output: (): string => chunks.join("") };
}

describe("stream terminal", () => {
  it("reads multi-line answers that end on an empty line, skipping leading blanks", async () => {
    const { terminal, output } = streams("\nfirst line   \nsecond line\n\nnext answer\n\n");
    terminal.write("Question\n");
    await expect(terminal.readAnswer()).resolves.toBe("first line\nsecond line");
    await expect(terminal.readAnswer()).resolves.toBe("next answer");
    terminal.close();
    expect(output()).toBe("Question\n>     >   ");
  });

  it("returns what was typed when input ends, and undefined once nothing is left", async () => {
    const { terminal } = streams("last words");
    await expect(terminal.readAnswer()).resolves.toBe("last words");
    await expect(terminal.readAnswer()).resolves.toBeUndefined();
  });

  it("returns undefined when the candidate quits mid-answer", async () => {
    const { terminal } = streams(`half an answer\n  ${QUIT_COMMAND}  \n`);
    await expect(terminal.readAnswer()).resolves.toBeUndefined();
  });

  it("defaults to the process streams", () => {
    const terminal = createStreamTerminal();
    terminal.close();
    expect(typeof terminal.readAnswer).toBe("function");
  });
});
