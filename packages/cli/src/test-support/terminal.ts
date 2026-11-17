import type { Terminal } from "../terminal.js";

/** A terminal fed with scripted answers (`undefined` = the candidate quits) that records its output. */
export interface ScriptedTerminal extends Terminal {
  readonly output: () => string;
  readonly closed: () => boolean;
}

export function scriptedTerminal(answers: readonly (string | undefined)[] = []): ScriptedTerminal {
  const queue = [...answers];
  const written: string[] = [];
  let closed = false;
  return {
    write: (text): void => {
      written.push(text);
    },
    readAnswer: (): Promise<string | undefined> => Promise.resolve(queue.shift()),
    close: (): void => {
      closed = true;
    },
    output: (): string => written.join(""),
    closed: (): boolean => closed,
  };
}
