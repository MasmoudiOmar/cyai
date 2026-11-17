import type { Result, VoiceInfo } from "@cyai/spec";

/** A microphone that is recording. */
export interface Capture {
  /** The current input level (root mean square, 0 to 1). */
  readonly level: () => number;
  /** Stops recording. `heard` is what the browser recogniser understood, when it ran. */
  readonly finish: () => Promise<Recorded>;
  /** Stops recording and throws it away. */
  readonly cancel: () => void;
}

export interface Recorded {
  readonly audio: Blob;
  readonly heard: string;
}

/** The browser's audio, behind an interface so components can be tested with fakes. */
export interface VoiceIO {
  /** Which services the server provides; the browser covers the rest. */
  readonly info: VoiceInfo;
  /** Says `text` and resolves when the interviewer has finished speaking. */
  readonly speak: (text: string) => Promise<void>;
  /** Cuts the interviewer off. */
  readonly hush: () => void;
  /** Opens the microphone, or says why it cannot. */
  readonly listen: () => Promise<Result<Capture, string>>;
}
