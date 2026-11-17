import { formatDebrief, type PracticeError, type PracticeService } from "@cyai/core";
import { ok, type PracticeView, type QuestionView, type Result, type StartPractice } from "@cyai/spec";

import { QUIT_COMMAND, type Terminal } from "./terminal.js";

export interface PracticeDeps {
  readonly service: PracticeService;
  readonly terminal: Terminal;
}

export type PracticeOutcome = "completed" | "abandoned";

export const QUIT_REASON = "Quit from the terminal.";

export const SPOKEN_IN_TERMINAL =
  "This interview is spoken. Here you type your answers; run `cyai ui` to answer out loud and get feedback on your delivery.";

function formatQuestion(view: QuestionView): string {
  const followUp = view.followUp ? " (follow-up)" : "";
  const prep = view.prepSeconds > 0 ? `${String(view.prepSeconds)}s to prepare, then ` : "";
  return [
    "",
    `Question ${String(view.number)} of up to ${String(view.maxQuestions)}${followUp}`,
    view.text,
    `(${prep}aim for ${String(view.softSeconds)}s, hard limit ${String(view.hardSeconds)}s. Finish with an empty line; ${QUIT_COMMAND} to stop.)`,
    "",
  ].join("\n");
}

/** Runs an interview in the terminal. The service saves the session after every step. */
export async function practice(deps: PracticeDeps, input: StartPractice): Promise<Result<PracticeOutcome, PracticeError>> {
  const { service, terminal } = deps;
  let view: Result<PracticeView, PracticeError> = await service.start(input);
  let first = true;
  for (;;) {
    if (!view.ok) {
      return view;
    }
    const current = view.value;
    if (first) {
      terminal.write(`Practice interview: ${current.role}\n`);
      if (current.kind === "question" && current.turnTaking.answer === "spoken") {
        terminal.write(`${SPOKEN_IN_TERMINAL}\n`);
      }
      first = false;
    }
    switch (current.kind) {
      case "completed":
        terminal.write(`\n${formatDebrief(current.role, current.scorecard, current.turns)}\n`);
        return ok("completed");
      case "abandoned":
        terminal.write(`\nStopped. Session ${current.sessionId} was saved as abandoned.\n`);
        return ok("abandoned");
      case "question": {
        terminal.write(formatQuestion(current));
        const answer = await terminal.readAnswer();
        if (answer === undefined) {
          view = await service.abandon(current.sessionId, QUIT_REASON);
        } else {
          terminal.write("Evaluating...\n");
          view = await service.answer(current.sessionId, answer);
        }
      }
    }
  }
}
