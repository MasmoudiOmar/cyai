// @vitest-environment jsdom
import { err, ok, type QuestionView, type SpeechMeasurement } from "@cyai/spec";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ApiClient } from "../api.js";
import { deferred } from "../test-support/deferred.js";
import { elapse } from "../test-support/clock.js";
import "../test-support/dom.js";
import { recordedQuestion, spokenQuestion } from "../test-support/views.js";
import { fakeVoice, quiet, talking, type FakeVoice } from "../test-support/voice.js";
import { NUDGE_LINE } from "../voice/use-spoken-turn.js";
import { VoiceRoom } from "./VoiceRoom.js";

type Transcribe = ApiClient["transcribe"];

interface Setup {
  readonly onAnswer: ReturnType<typeof vi.fn<(text: string, speech: SpeechMeasurement) => void>>;
  readonly onStop: ReturnType<typeof vi.fn<() => void>>;
  readonly onType: ReturnType<typeof vi.fn<() => void>>;
  readonly unmount: () => void;
}

function setup(voice: FakeVoice, view: QuestionView = spokenQuestion, transcribe: Transcribe = () => Promise.resolve(ok("")), busy = false): Setup {
  const onAnswer = vi.fn<(text: string, speech: SpeechMeasurement) => void>();
  const onStop = vi.fn<() => void>();
  const onType = vi.fn<() => void>();
  const { unmount } = render(
    <VoiceRoom view={view} voice={voice} api={{ transcribe }} busy={busy} onAnswer={onAnswer} onStop={onStop} onType={onType} />,
  );
  return { onAnswer, onStop, onType, unmount };
}

const label = (): string | null => screen.getByRole("status").textContent;

describe("VoiceRoom", () => {
  it("asks out loud, listens, and ends the answer after a long pause", async () => {
    const voice = fakeVoice({ levels: [...quiet(20), ...talking(40)], heard: "Um, I escalated." });
    const { onAnswer } = setup(voice);
    expect(voice.spoken).toEqual([spokenQuestion.text]);
    expect(screen.getByRole("heading", { name: spokenQuestion.text }).className).toBe("sr-only");
    await elapse(0);
    expect(label()).toBe("Listening");
    expect(screen.getByText(/stop talking for 4 seconds/)).toBeDefined();

    await elapse(6_900);
    expect(onAnswer).not.toHaveBeenCalled();
    await elapse(200);
    expect(onAnswer).toHaveBeenCalledWith("Um, I escalated.", {
      speechMs: 2_000,
      latencyMs: 1_050,
      pauses: [],
      transcriber: "browser",
    });
    expect(voice.events).toEqual(["listen", "finish"]);
  });

  it("checks in once when the candidate says nothing", async () => {
    const voice = fakeVoice({ levels: [...quiet(200), ...talking(10)] });
    setup(voice);
    await elapse(10_000);
    expect(voice.spoken).toEqual([spokenQuestion.text, NUDGE_LINE]);
    await elapse(20_000);
    expect(voice.spoken.filter((line) => line === NUDGE_LINE)).toHaveLength(1);
  });

  it("shows the interviewer speaking while it nudges", async () => {
    const voice = fakeVoice({ holdLine: NUDGE_LINE });
    setup(voice);
    await elapse(10_100);
    expect(label()).toBe("Interviewer speaking");
    await act(async () => {
      voice.release();
      await Promise.resolve();
    });
    expect(label()).toBe("Listening");
  });

  it("records one-way answers after the prep time until Done", async () => {
    const voice = fakeVoice({ levels: talking(100), heard: "My answer." });
    const { onAnswer } = setup(voice, recordedQuestion);
    expect(screen.getByRole("heading", { name: recordedQuestion.text }).className).toBe("display");
    const done = screen.getByRole("button", { name: /Done/ });
    await elapse(0);
    expect([label(), done.hasAttribute("disabled")]).toEqual(["Prepare your answer", true]);
    expect(screen.getByRole("timer").textContent).toBe("0:05");
    await elapse(5_000);
    expect([label(), done.hasAttribute("disabled")]).toEqual(["Listening", false]);
    await elapse(20_000);
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.click(done);
    await elapse(100);
    expect(onAnswer).toHaveBeenCalledWith("My answer.", expect.objectContaining({ latencyMs: 50 }));
  });

  it("cuts the answer off at the hard limit", async () => {
    const voice = fakeVoice({ levels: talking(1_000) });
    const { onAnswer } = setup(voice, recordedQuestion);
    await elapse(5_000 + 29_900);
    expect(onAnswer).not.toHaveBeenCalled();
    await elapse(200);
    expect(onAnswer).toHaveBeenCalledOnce();
    expect(label()).toBe("Transcribing your answer");
  });

  it("offers typing when the microphone is unavailable", async () => {
    const { onType } = setup(fakeVoice({ denied: "No microphone." }));
    await elapse(0);
    expect(label()).toBe("Audio stopped");
    fireEvent.click(screen.getByRole("button", { name: "Type this answer instead" }));
    expect(onType).toHaveBeenCalledOnce();
  });

  it("reports a failed transcription", async () => {
    const voice = fakeVoice({ levels: talking(10), info: { transcription: "whisper", voice: "browser" } });
    const { onAnswer } = setup(voice, spokenQuestion, () => Promise.resolve(err("whisper is down")));
    await elapse(5_000);
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("whisper is down");
  });

  it("toggles captions, ends the interview and shows evaluation", () => {
    const { onStop } = setup(fakeVoice({ holdLine: spokenQuestion.text }), spokenQuestion, undefined, true);
    const toggle = screen.getByRole("button", { name: /Show captions/ });
    fireEvent.click(toggle);
    expect(screen.getByRole("heading", { name: spokenQuestion.text }).className).toBe("display");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Hide captions/ }));
    expect(screen.getAllByRole("status").map((element) => element.textContent)).toContain("Evaluating");
    expect(screen.getByRole("button", { name: /End interview/ }).hasAttribute("disabled")).toBe(true);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("stops cleanly wherever the candidate leaves", async () => {
    const asking = fakeVoice({ holdLine: spokenQuestion.text });
    setup(asking).unmount();
    await elapse(0);
    expect(asking.events).toEqual(["hush"]);

    const preparing = fakeVoice();
    const prep = setup(preparing, recordedQuestion);
    await elapse(1_000);
    prep.unmount();
    await elapse(5_000);
    expect(preparing.events).toEqual(["hush"]);

    const opening = fakeVoice({ holdListen: true });
    const open = setup(opening);
    await elapse(0);
    open.unmount();
    await elapse(0);
    expect(opening.events).toEqual(["listen", "hush", "cancel"]);

    const denied = fakeVoice({ holdListen: true, denied: "No microphone." });
    const deniedRoom = setup(denied);
    await elapse(0);
    deniedRoom.unmount();
    await elapse(0);
    expect(denied.events).toEqual(["listen", "hush"]);

    const listening = fakeVoice();
    const listen = setup(listening);
    await elapse(100);
    listen.unmount();
    await elapse(100);
    expect(listening.events).toEqual(["listen", "cancel", "hush"]);

    const nudging = fakeVoice({ holdLine: NUDGE_LINE });
    const nudge = setup(nudging);
    await elapse(10_100);
    nudge.unmount();
    await elapse(100);
    expect(nudging.events).toEqual(["listen", "cancel", "hush"]);

    const slow = deferred<Awaited<ReturnType<Transcribe>>>();
    const transcribing = fakeVoice({ levels: talking(10), info: { transcription: "whisper", voice: "browser" } });
    const late = setup(transcribing, spokenQuestion, () => slow.promise);
    await elapse(5_000);
    late.unmount();
    await act(async () => {
      slow.resolve(ok("Too late."));
      await slow.promise;
    });
    expect(late.onAnswer).not.toHaveBeenCalled();
  });
});
