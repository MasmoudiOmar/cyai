import { err, ok, type Result, type VoiceInfo } from "@cyai/spec";

import type { Capture, Recorded, VoiceIO } from "../voice/io.js";

export interface FakeVoiceOptions {
  /** Microphone level for each frame read, in order; silence after the last one. */
  readonly levels?: readonly number[];
  readonly heard?: string;
  /** Why the microphone cannot open, when it cannot. */
  readonly denied?: string;
  readonly info?: VoiceInfo;
  /** A line whose speech stays pending until `release()` (or `hush()`). */
  readonly holdLine?: string;
  /** Keeps the microphone opening until `release()`. */
  readonly holdListen?: boolean;
}

export interface FakeVoice extends VoiceIO {
  /** Every line the interviewer said. */
  readonly spoken: readonly string[];
  /** Microphone and speech calls, in order. */
  readonly events: readonly string[];
  /** Finishes whatever is being held. */
  readonly release: () => void;
}

/** Scripted audio: speech is instant and the microphone reads `levels`, one per frame. */
export function fakeVoice(options: FakeVoiceOptions = {}): FakeVoice {
  const levels = [...(options.levels ?? [])];
  const spoken: string[] = [];
  const events: string[] = [];
  const held: (() => void)[] = [];
  const capture: Capture = {
    level: (): number => levels.shift() ?? 0,
    finish: (): Promise<Recorded> => {
      events.push("finish");
      return Promise.resolve({ audio: new Blob([], { type: "audio/webm" }), heard: options.heard ?? "" });
    },
    cancel: (): void => {
      events.push("cancel");
    },
  };
  const opened: Result<Capture, string> = options.denied === undefined ? ok(capture) : err(options.denied);
  const release = (): void => {
    for (const finish of held.splice(0)) {
      finish();
    }
  };
  return {
    info: options.info ?? { transcription: "browser", voice: "browser" },
    spoken,
    events,
    release,
    speak: (text): Promise<void> => {
      spoken.push(text);
      return text === options.holdLine
        ? new Promise((resolve) => {
            held.push(resolve);
          })
        : Promise.resolve();
    },
    hush: (): void => {
      events.push("hush");
      release();
    },
    listen: (): Promise<Result<Capture, string>> => {
      events.push("listen");
      return options.holdListen === true
        ? new Promise((resolve) => {
            held.push(() => {
              resolve(opened);
            });
          })
        : Promise.resolve(opened);
    },
  };
}

/** `count` frames of clear speech. */
export function talking(count: number): number[] {
  return Array.from({ length: count }, () => 0.1);
}

/** `count` frames of silence. */
export function quiet(count: number): number[] {
  return Array.from({ length: count }, () => 0);
}
