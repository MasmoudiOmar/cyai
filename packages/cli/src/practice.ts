import {
  abandonSession,
  answerRun,
  formatDebrief,
  nowIso,
  resolveInterview,
  startRun,
  type CyaiError,
  type InterviewContext,
  type RunnerDeps,
  type SessionStore,
  type StoreError,
  type SettledProgress,
  type TemplateCatalog,
} from "@cyai/core";
import { ok, type CandidateContext, type Result, type SessionIn, type SessionRecord } from "@cyai/spec";

import { QUIT_COMMAND, type Terminal } from "./terminal.js";

export interface PracticeDeps extends RunnerDeps {
  readonly catalog: TemplateCatalog;
  readonly store: SessionStore;
  readonly terminal: Terminal;
}

export interface PracticeInput {
  readonly interviewId: string;
  readonly candidate: CandidateContext;
}

export type PracticeOutcome = "completed" | "abandoned";

const QUIT_REASON = "Quit from the terminal.";

function formatQuestion(context: InterviewContext, session: SessionIn<"awaiting_answer">): string {
  const { prepSeconds, answer } = context.profile.timing;
  const followUp = session.pending.followUpOf === undefined ? "" : " (follow-up)";
  const prep = prepSeconds > 0 ? `${String(prepSeconds)}s to prepare, then ` : "";
  return [
    "",
    `Question ${String(session.turns.length + 1)}${followUp}`,
    session.pending.text,
    `(${prep}aim for ${String(answer.softSeconds)}s, hard limit ${String(answer.hardSeconds)}s. Finish with an empty line; ${QUIT_COMMAND} to stop.)`,
    "",
  ].join("\n");
}

/** Runs an interview in the terminal with a model as interviewer, saving after every step. */
export async function practice(deps: PracticeDeps, input: PracticeInput): Promise<Result<PracticeOutcome, CyaiError>> {
  const context = resolveInterview(deps.catalog, input.interviewId, input.candidate);
  if (!context.ok) {
    return context;
  }
  const save = (
    session: SessionIn<"awaiting_answer" | "completed" | "abandoned">,
  ): Promise<Result<SessionRecord, StoreError>> =>
    deps.store.save({ session, candidate: input.candidate });

  deps.terminal.write(`${context.value.interview.role}: ${context.value.profile.name}\n`);
  let progress: Result<SettledProgress, CyaiError> = await startRun(context.value, deps);
  for (;;) {
    if (!progress.ok) {
      return progress;
    }
    const saved = await save(progress.value.session);
    if (!saved.ok) {
      return saved;
    }
    if (progress.value.kind === "completed") {
      const { session } = progress.value;
      deps.terminal.write(`\n${formatDebrief(context.value.interview.role, session.scorecard, session.turns)}\n`);
      return ok("completed");
    }
    const { session } = progress.value;
    deps.terminal.write(formatQuestion(context.value, session));
    const answer = await deps.terminal.readAnswer();
    if (answer === undefined) {
      const abandoned = abandonSession(session, nowIso(deps.clock), QUIT_REASON);
      if (!abandoned.ok) {
        return abandoned;
      }
      const stored = await save(abandoned.value);
      if (!stored.ok) {
        return stored;
      }
      deps.terminal.write(`\nStopped. Session ${session.id} was saved as abandoned.\n`);
      return ok("abandoned");
    }
    deps.terminal.write("Evaluating...\n");
    progress = await answerRun(context.value, deps, session, answer);
  }
}
