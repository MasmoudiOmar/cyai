import { err, ok, type VoiceInfo } from "@cyai/spec";
import { describe, expect, it } from "vitest";

import type { ApiClient } from "../api.js";
import { transcribeAnswer } from "./transcript.js";

const audio = new Blob([], { type: "audio/webm" });
const whisper: VoiceInfo = { transcription: "whisper", voice: "browser" };
const working: Pick<ApiClient, "transcribe"> = { transcribe: () => Promise.resolve(ok("Um, yes.")) };
const down: Pick<ApiClient, "transcribe"> = { transcribe: () => Promise.resolve(err("whisper is down")) };

describe("transcribeAnswer", () => {
  it("uses Whisper when the server has it", async () => {
    expect(await transcribeAnswer(working, whisper, { audio, heard: "" })).toEqual(ok({ text: "Um, yes.", transcriber: "whisper" }));
  });

  it("uses the browser recogniser otherwise", async () => {
    expect(await transcribeAnswer(down, { ...whisper, transcription: "browser" }, { audio, heard: "Yes." })).toEqual(
      ok({ text: "Yes.", transcriber: "browser" }),
    );
  });

  it("falls back to what the browser heard, or reports the failure", async () => {
    expect(await transcribeAnswer(down, whisper, { audio, heard: "Yes." })).toEqual(ok({ text: "Yes.", transcriber: "browser" }));
    expect(await transcribeAnswer(down, whisper, { audio, heard: "" })).toEqual(err("whisper is down"));
  });
});
