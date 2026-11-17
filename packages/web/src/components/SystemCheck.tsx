import { useEffect, useRef, useState, type JSX } from "react";

import type { VoiceIO } from "../voice/io.js";
import { showLevel } from "../voice/meter.js";
import { FRAME_MS, hear, SILENT } from "../voice/vad.js";
import { Icon } from "./Icon.js";

export const SAMPLE_LINE = "Hi, thanks for joining. I'll ask you a few questions. Answer out loud, in your own words.";

/** How long the microphone test listens, and how much speech counts as being heard. */
const TEST_MS = 6_000;
const HEARD_MS = 300;

type MicState = "idle" | "testing" | "heard" | "silent" | "failed";

const MIC_MESSAGES: Readonly<Record<MicState, string>> = {
  idle: "Say a sentence when you start the test.",
  testing: "Listening… say a sentence.",
  heard: "We can hear you.",
  silent: "We could not hear you. Check which microphone your browser uses, then test again.",
  failed: "",
};

interface SystemCheckProps {
  readonly voice: VoiceIO;
  /** Called once the microphone has heard the candidate. */
  readonly onReady: () => void;
}

/** The audio check voice screeners run before the interview: can it hear you, can you hear it. */
export function SystemCheck({ voice, onReady }: SystemCheckProps): JSX.Element {
  const [mic, setMic] = useState<MicState>("idle");
  const [micError, setMicError] = useState("");
  const [played, setPlayed] = useState(false);
  const meter = useRef<HTMLSpanElement | null>(null);
  const testing = useRef<(() => void) | undefined>(undefined);

  useEffect(
    () => (): void => {
      testing.current?.();
    },
    [],
  );

  const testMicrophone = async (): Promise<void> => {
    setMic("testing");
    const opened = await voice.listen();
    if (!opened.ok) {
      setMicError(opened.error);
      setMic("failed");
      return;
    }
    const capture = opened.value;
    const test = { stopped: false };
    testing.current = (): void => {
      test.stopped = true;
      capture.cancel();
    };
    let vad = SILENT;
    for (let atMs = 0; atMs < TEST_MS && vad.speechMs < HEARD_MS; atMs += FRAME_MS) {
      await new Promise((resolve) => setTimeout(resolve, FRAME_MS));
      if (test.stopped) {
        return;
      }
      const level = capture.level();
      vad = hear(vad, level, atMs);
      showLevel(meter, level);
    }
    capture.cancel();
    testing.current = undefined;
    showLevel(meter, 0);
    const heard = vad.speechMs >= HEARD_MS;
    setMic(heard ? "heard" : "silent");
    if (heard) {
      onReady();
    }
  };

  return (
    <section className="system-check" aria-label="Audio check">
      <div className={`check-row mic-${mic}`}>
        <span className="check-icon">
          <span className="mic-level" ref={meter} />
          <Icon name={mic === "heard" ? "check" : "live"} size={18} />
        </span>
        <span>
          <strong>Microphone</strong>
          <span className="muted">{mic === "failed" ? micError : MIC_MESSAGES[mic]}</span>
        </span>
        <button type="button" className="button ghost" disabled={mic === "testing"} onClick={() => void testMicrophone()}>
          {mic === "idle" ? "Test" : "Test again"}
        </button>
      </div>
      <div className={`check-row ${played ? "mic-heard" : ""}`}>
        <span className="check-icon">
          <Icon name={played ? "check" : "speaker"} size={18} />
        </span>
        <span>
          <strong>Speakers</strong>
          <span className="muted">{played ? "Played. Turn the volume up if it was quiet." : "Hear how your interviewer sounds."}</span>
        </span>
        <button
          type="button"
          className="button ghost"
          onClick={() => {
            void voice.speak(SAMPLE_LINE).then(() => {
              setPlayed(true);
            });
          }}
        >
          Play
        </button>
      </div>
    </section>
  );
}
