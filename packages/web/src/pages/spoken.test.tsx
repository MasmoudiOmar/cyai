// @vitest-environment jsdom
import { SESSION_ID } from "@cyai/fixtures";
import { ok, type InterviewSummary, type SpeechMeasurement } from "@cyai/spec";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { elapse } from "../test-support/clock.js";
import "../test-support/dom.js";
import { fakeApi, interview, recordedQuestion, spokenInterview, spokenQuestion } from "../test-support/views.js";
import { fakeVoice, talking } from "../test-support/voice.js";
import { HomePage } from "./HomePage.js";
import { SessionPage } from "./SessionPage.js";
import { SetupPage } from "./SetupPage.js";

const interviews = (...list: InterviewSummary[]): ReturnType<typeof fakeApi> => fakeApi({ interviews: () => Promise.resolve(ok(list)) });
const startButton = (): HTMLElement => screen.getByRole("button", { name: /interview|microphone/ });

describe("spoken interviews", () => {
  it("are marked on the home page", async () => {
    render(<HomePage api={interviews(spokenInterview, { ...interview, id: "typed" })} />);
    await elapse(0);
    expect(screen.getByText("Spoken")).toBeDefined();
    expect(screen.getByText("Typed")).toBeDefined();
  });

  it("need a microphone test before they start", async () => {
    render(<SetupPage api={interviews(spokenInterview)} voice={fakeVoice({ levels: talking(20) })} interviewId={interview.id} />);
    await elapse(0);
    expect(screen.getByText("Spoken answers")).toBeDefined();
    expect(screen.getByText(/moves on when you pause for 4 seconds/)).toBeDefined();
    expect([startButton().textContent, startButton().hasAttribute("disabled")]).toEqual(["Test your microphone to start ", true]);
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await elapse(1_000);
    expect([startButton().textContent, startButton().hasAttribute("disabled")]).toEqual(["Start interview ", false]);
  });

  it("wait for the audio to connect, and describe each way of answering", async () => {
    const recorded = { ...spokenInterview, turnTaking: recordedQuestion.turnTaking };
    render(<SetupPage api={interviews(recorded)} voice={undefined} interviewId={interview.id} />);
    await elapse(0);
    expect(screen.getByRole("status", { name: "Connecting your audio" })).toBeDefined();
    expect(screen.getByText(/recorded until the window closes/)).toBeDefined();
  });

  it("describe typed interviews as typed", async () => {
    render(<SetupPage api={interviews(interview)} voice={undefined} interviewId={interview.id} />);
    await elapse(0);
    expect(screen.getByText("Typed answers")).toBeDefined();
    expect(screen.getByText("Type your answers and submit each one.")).toBeDefined();
  });

  it("are answered out loud and sent with their timing", async () => {
    const answer = vi.fn<(sessionId: string, text: string, speech?: SpeechMeasurement) => ReturnType<ReturnType<typeof fakeApi>["answer"]>>(
      () => new Promise(() => undefined),
    );
    const api = fakeApi({ session: () => Promise.resolve(ok(spokenQuestion)), answer });
    render(<SessionPage api={api} voice={fakeVoice({ levels: talking(10), heard: "Um, hi." })} sessionId={SESSION_ID} />);
    await elapse(0);
    await elapse(5_000);
    expect(answer).toHaveBeenCalledWith(SESSION_ID, "Um, hi.", expect.objectContaining({ speechMs: 500, transcriber: "browser" }));
    expect(screen.getAllByText("Evaluating").length).toBeGreaterThan(0);
  });

  it("wait for the audio to connect, and fall back to typing", async () => {
    const api = fakeApi({ session: () => Promise.resolve(ok(spokenQuestion)) });
    const { unmount } = render(<SessionPage api={api} voice={undefined} sessionId={SESSION_ID} />);
    await elapse(0);
    expect(screen.getByRole("status", { name: "Connecting your audio" })).toBeDefined();
    unmount();

    render(<SessionPage api={api} voice={fakeVoice({ denied: "No microphone." })} sessionId={SESSION_ID} />);
    await elapse(0);
    fireEvent.click(screen.getByRole("button", { name: "Type this answer instead" }));
    expect(screen.getByLabelText("Your answer")).toBeDefined();
  });
});
