import { err, ok, type Result, type VoiceInfo } from "@cyai/spec";

import type { ApiClient } from "../api.js";
import type { Capture, Recorded, VoiceIO } from "./io.js";

/**
 * The browser side of spoken interviews: microphone, recorder, speech recognition and voices.
 * This file only wires Web APIs together; every decision lives in tested modules (vad, turn,
 * transcript) and the components.
 */

const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];
const RECOGNITION_GRACE_MS = 1_500;
/** Voices that sound least robotic, by name, in order of preference. */
const PREFERRED_VOICES = [/natural/i, /google us english/i, /samantha/i, /aria/i, /jenny/i];

export const MIC_DENIED =
  "cyai cannot use your microphone. Allow microphone access for this page in your browser, then try again.";

function rms(samples: Float32Array<ArrayBuffer>): number {
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

function englishVoice(): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith("en"));
  for (const pattern of PREFERRED_VOICES) {
    const match = voices.find((voice) => pattern.test(voice.name));
    if (match !== undefined) {
      return match;
    }
  }
  return voices.find((voice) => voice.lang === "en-US") ?? voices[0];
}

/** Listens with the browser recogniser and collects every final phrase until stopped. */
function recognise(): { readonly stop: () => Promise<string> } | undefined {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (Recognition === undefined) {
    return undefined;
  }
  const recognition = new Recognition();
  const phrases: string[] = [];
  const state = { active: true, ended: (): void => undefined };
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = "en-US";
  recognition.onresult = (event): void => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result?.isFinal === true) {
        phrases.push(result[0]?.transcript.trim() ?? "");
      }
    }
  };
  // Chrome stops recognising after a while on its own; keep it going for the whole answer.
  recognition.onend = (): void => {
    if (state.active) {
      recognition.start();
    } else {
      state.ended();
    }
  };
  recognition.onerror = (): void => undefined;
  recognition.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        const done = (): void => {
          resolve(phrases.filter((phrase) => phrase.length > 0).join(" "));
        };
        state.ended = done;
        state.active = false;
        recognition.stop();
        setTimeout(done, RECOGNITION_GRACE_MS);
      }),
  };
}

async function openMicrophone(useRecogniser: boolean): Promise<Result<Capture, string>> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    return err(MIC_DENIED);
  }
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(stream, mimeType === undefined ? {} : { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event): void => {
    chunks.push(event.data);
  };
  recorder.start(1_000);
  const recogniser = useRecogniser ? recognise() : undefined;

  const release = (): void => {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    void context.close();
  };
  const stopRecorder = (): Promise<Blob> =>
    new Promise((resolve) => {
      recorder.onstop = (): void => {
        resolve(new Blob(chunks, { type: recorder.mimeType }));
      };
      recorder.stop();
    });

  return ok({
    level: () => {
      analyser.getFloatTimeDomainData(samples);
      return rms(samples);
    },
    finish: async (): Promise<Recorded> => {
      const [audio, heard] = await Promise.all([stopRecorder(), recogniser?.stop() ?? Promise.resolve("")]);
      release();
      return { audio, heard };
    },
    cancel: () => {
      void recogniser?.stop();
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
      release();
    },
  });
}

/** Spoken interviews in this browser, using the server's speech services where it has them. */
export function createBrowserVoice(api: Pick<ApiClient, "speech">, info: VoiceInfo): VoiceIO {
  let interrupt: (() => void) | undefined;

  const play = (audio: Blob): Promise<void> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(audio);
      const element = new Audio(url);
      const done = (): void => {
        interrupt = undefined;
        URL.revokeObjectURL(url);
        resolve();
      };
      interrupt = (): void => {
        element.pause();
        done();
      };
      element.onended = done;
      element.onerror = done;
      element.play().catch(done);
    });

  const synthesise = (text: string): Promise<void> =>
    new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      const voice = englishVoice();
      if (voice !== undefined) {
        utterance.voice = voice;
      }
      const done = (): void => {
        interrupt = undefined;
        resolve();
      };
      interrupt = (): void => {
        speechSynthesis.cancel();
        done();
      };
      utterance.onend = done;
      utterance.onerror = done;
      speechSynthesis.speak(utterance);
    });

  return {
    info,
    speak: async (text): Promise<void> => {
      if (info.voice === "endpoint") {
        const audio = await api.speech(text);
        if (audio.ok) {
          await play(audio.value);
          return;
        }
      }
      await synthesise(text);
    },
    hush: (): void => {
      interrupt?.();
    },
    listen: () => openMicrophone(info.transcription === "browser"),
  };
}
