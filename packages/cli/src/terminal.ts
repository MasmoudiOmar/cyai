import { createInterface } from "node:readline";

/** Line-based console I/O. Inject a fake in tests. */
export interface Terminal {
  readonly write: (text: string) => void;
  /**
   * Reads a multi-line answer, finished by an empty line.
   * Returns `undefined` when the candidate types `/quit` or input ends with nothing typed.
   */
  readonly readAnswer: () => Promise<string | undefined>;
  readonly close: () => void;
}

export const QUIT_COMMAND = "/quit";

export function createStreamTerminal(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Terminal {
  const reader = createInterface({ input, terminal: false });
  const lines = reader[Symbol.asyncIterator]();
  return {
    write: (text): void => {
      output.write(text);
    },
    readAnswer: async (): Promise<string | undefined> => {
      const collected: string[] = [];
      output.write("> ");
      for (;;) {
        const next = await lines.next();
        if (next.done === true) {
          return collected.length > 0 ? collected.join("\n") : undefined;
        }
        const line = next.value.trimEnd();
        if (line.trim() === QUIT_COMMAND) {
          return undefined;
        }
        if (line.trim().length === 0) {
          if (collected.length > 0) {
            return collected.join("\n");
          }
          continue;
        }
        collected.push(line);
        output.write("  ");
      }
    },
    close: (): void => {
      reader.close();
    },
  };
}
