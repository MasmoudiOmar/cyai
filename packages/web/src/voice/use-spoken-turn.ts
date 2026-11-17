import type { QuestionView, SpeechMeasurement } from "@cyai/spec";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import type { ApiClient } from "../api.js";
import type { Capture, VoiceIO } from "./io.js";
import { showLevel } from "./meter.js";
import { transcribeAnswer } from "./transcript.js";
import { measurement, turnSignal } from "./turn.js";
import { FRAME_MS, hear, SILENT } from "./vad.js";

/** What the interviewer says when the candidate stays silent, as voice screeners do. */
export const NUDGE_LINE = "Take your time. Whenever you're ready, go ahead.";

export type SpokenPhase = "asking" | "prep" | "listening" | "nudging" | "transcribing" | "failed";

export interface SpokenTurn {
  readonly phase: SpokenPhase;
  /** Seconds on the interviewer's clock, which starts once the question has been asked. */
  readonly clockStartedAt: number | undefined;
  readonly error: string | undefined;
  /** Ends the answer now ("I'm done"). */
  readonly finish: () => void;
}

export type AnswerHandler = (text: string, speech: SpeechMeasurement) => void;

/**
 * One spoken turn: the interviewer asks out loud, any prep time runs, then the microphone
 * listens until the turn-taking rules end the answer, which is transcribed and handed on.
 */
export function useSpokenTurn(
  view: QuestionView,
  voice: VoiceIO,
  api: Pick<ApiClient, "transcribe">,
  onAnswer: AnswerHandler,
  /** Scaled with the microphone level, without re-rendering. */
  meter: RefObject<HTMLElement | null>,
): SpokenTurn {
  const [phase, setPhase] = useState<SpokenPhase>("asking");
  const [clockStartedAt, setClockStartedAt] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();
  const finishing = useRef(false);
  const answer = useRef(onAnswer);
  useEffect(() => {
    answer.current = onAnswer;
  }, [onAnswer]);

  useEffect(() => {
    // Every await is followed by a check: leaving the page mid-turn stops the turn there.
    const turn = new AbortController();
    // A call, not a property read: TypeScript would keep a narrowed `aborted` across awaits.
    const left = (): boolean => turn.signal.aborted;
    let capture: Capture | undefined;
    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    const fail = (message: string): void => {
      setError(message);
      setPhase("failed");
    };
    const rules = { turnTaking: view.turnTaking, hardSeconds: view.hardSeconds };

    const listen = async (opened: Capture): Promise<void> => {
      const startedAt = Date.now();
      let vad = SILENT;
      let nudged = false;
      for (;;) {
        await wait(FRAME_MS);
        if (left()) {
          return;
        }
        const atMs = Date.now() - startedAt;
        const level = opened.level();
        vad = hear(vad, level, atMs);
        showLevel(meter, level);
        const signal = finishing.current ? "end" : turnSignal(rules, vad, atMs, nudged);
        if (signal === "end") {
          break;
        }
        if (signal === "nudge") {
          nudged = true;
          setPhase("nudging");
          await voice.speak(NUDGE_LINE);
          if (left()) {
            return;
          }
          setPhase("listening");
        }
      }
      const endedMs = Date.now() - startedAt;
      setPhase("transcribing");
      capture = undefined;
      const recorded = await opened.finish();
      const transcript = await transcribeAnswer(api, voice.info, recorded);
      if (left()) {
        return;
      }
      if (transcript.ok) {
        answer.current(transcript.value.text, measurement(vad, endedMs, transcript.value.transcriber));
      } else {
        fail(transcript.error);
      }
    };

    const run = async (): Promise<void> => {
      await voice.speak(view.text);
      if (left()) {
        return;
      }
      setClockStartedAt(Date.now());
      if (view.prepSeconds > 0) {
        setPhase("prep");
        await wait(view.prepSeconds * 1000);
        if (left()) {
          return;
        }
      }
      const opened = await voice.listen();
      if (left()) {
        if (opened.ok) {
          opened.value.cancel();
        }
        return;
      }
      if (!opened.ok) {
        fail(opened.error);
        return;
      }
      capture = opened.value;
      setPhase("listening");
      await listen(opened.value);
    };

    void run();
    return (): void => {
      turn.abort();
      capture?.cancel();
      voice.hush();
    };
  }, [api, meter, view, voice]);

  const finish = useCallback((): void => {
    finishing.current = true;
  }, []);

  return { phase, clockStartedAt, error, finish };
}
