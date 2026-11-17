import { ok, type Transcriber, type VoiceInfo } from "@cyai/spec";

import type { ApiClient, ApiResult } from "../api.js";
import type { Recorded } from "./io.js";

export interface Transcript {
  readonly text: string;
  readonly transcriber: Transcriber;
}

/**
 * The answer's text: from the server's Whisper when it has one, else from the browser's
 * recogniser. If Whisper fails, whatever the browser heard is better than nothing.
 */
export async function transcribeAnswer(
  api: Pick<ApiClient, "transcribe">,
  info: VoiceInfo,
  recorded: Recorded,
): ApiResult<Transcript> {
  if (info.transcription === "browser") {
    return ok({ text: recorded.heard, transcriber: "browser" });
  }
  const text = await api.transcribe(recorded.audio);
  if (text.ok) {
    return ok({ text: text.value, transcriber: "whisper" });
  }
  return recorded.heard.length > 0 ? ok({ text: recorded.heard, transcriber: "browser" }) : text;
}
