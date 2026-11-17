import type { AudioClip, ModelError, Speaker, Transcriber } from "@cyai/core";
import { err, ok, type Result } from "@cyai/spec";
import { z } from "zod";

import { unexpectedBody } from "./failures.js";
import { postTo, readBody, type EndpointOptions } from "./http.js";

/**
 * Whisper writes clean prose unless its prompt shows disfluent speech; this one keeps the
 * ums, uhs and restarts that delivery scoring counts.
 */
export const VERBATIM_PROMPT = "Um, so, uh, I was, I was thinking... hmm. I mean, you know, it was, like, erm, fine.";

export const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";
export const DEFAULT_SPEECH_MODEL = "tts-1";
export const DEFAULT_SPEECH_VOICE = "alloy";

/** Interviews are rehearsed in spoken English. */
const LANGUAGE = "en";

const EXTENSIONS: Readonly<Record<string, string>> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

const transcriptionSchema = z.object({ text: z.string() });

/** A file name whose extension matches the media type, which some servers use to pick a decoder. */
export function audioFileName({ type }: AudioClip): string {
  return `answer.${EXTENSIONS[type.replace(/;.*$/, "").trim()] ?? "webm"}`;
}

export interface TranscriberOptions extends EndpointOptions {
  readonly model?: string;
}

/** Any server speaking OpenAI's `/audio/transcriptions`: whisper.cpp, faster-whisper-server, OpenAI. */
export function createWhisperTranscriber(options: TranscriberOptions): Transcriber {
  return {
    transcribe: async (audio): Promise<Result<string, ModelError>> => {
      const form = new FormData();
      form.append("file", new Blob([audio.bytes], { type: audio.type }), audioFileName(audio));
      form.append("model", options.model ?? DEFAULT_TRANSCRIPTION_MODEL);
      form.append("language", LANGUAGE);
      form.append("prompt", VERBATIM_PROMPT);
      form.append("response_format", "json");
      const response = await postTo(options, "/audio/transcriptions", { body: form });
      if (!response.ok) {
        return response;
      }
      const body = await readBody((): Promise<unknown> => response.value.json());
      if (!body.ok) {
        return body;
      }
      const parsed = transcriptionSchema.safeParse(body.value);
      return parsed.success
        ? ok(parsed.data.text.trim())
        : err(unexpectedBody("transcription", parsed.error));
    },
  };
}

export interface SpeakerOptions extends EndpointOptions {
  readonly model?: string;
  readonly voice?: string;
}

/** Any server speaking OpenAI's `/audio/speech`: Kokoro-FastAPI, openedai-speech, OpenAI. */
export function createSpeechEndpoint(options: SpeakerOptions): Speaker {
  return {
    speak: async (text): Promise<Result<AudioClip, ModelError>> => {
      const response = await postTo(options, "/audio/speech", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: options.model ?? DEFAULT_SPEECH_MODEL,
          voice: options.voice ?? DEFAULT_SPEECH_VOICE,
          input: text,
          response_format: "mp3",
        }),
      });
      if (!response.ok) {
        return response;
      }
      const bytes = await readBody(() => response.value.arrayBuffer());
      return bytes.ok
        ? ok({ bytes: new Uint8Array(bytes.value), type: response.value.headers.get("content-type") ?? "audio/mpeg" })
        : bytes;
    },
  };
}
