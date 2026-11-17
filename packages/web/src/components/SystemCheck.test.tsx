// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { elapse } from "../test-support/clock.js";
import "../test-support/dom.js";
import { fakeVoice, quiet, talking, type FakeVoice } from "../test-support/voice.js";
import { SAMPLE_LINE, SystemCheck } from "./SystemCheck.js";

function setup(voice: FakeVoice): { readonly onReady: ReturnType<typeof vi.fn<() => void>>; readonly unmount: () => void } {
  const onReady = vi.fn<() => void>();
  const { unmount } = render(<SystemCheck voice={voice} onReady={onReady} />);
  return { onReady, unmount };
}

const testButton = (): HTMLElement => screen.getByRole("button", { name: /^Test/ });

describe("SystemCheck", () => {
  it("passes once the microphone hears the candidate", async () => {
    const voice = fakeVoice({ levels: [...quiet(10), ...talking(10)] });
    const { onReady } = setup(voice);
    expect(screen.getByText("Say a sentence when you start the test.")).toBeDefined();
    fireEvent.click(testButton());
    await elapse(0);
    expect(screen.getByText("Listening… say a sentence.")).toBeDefined();
    expect(testButton().hasAttribute("disabled")).toBe(true);
    await elapse(1_000);
    expect(screen.getByText("We can hear you.")).toBeDefined();
    expect(onReady).toHaveBeenCalledOnce();
    expect(voice.events).toEqual(["listen", "cancel"]);
    expect(testButton().textContent).toBe("Test again");
  });

  it("says when it hears nothing or cannot open the microphone", async () => {
    const { onReady } = setup(fakeVoice());
    fireEvent.click(testButton());
    await elapse(6_000);
    expect(screen.getByText(/We could not hear you/)).toBeDefined();
    expect(onReady).not.toHaveBeenCalled();
    expect(testButton().textContent).toBe("Test again");
  });

  it("explains a blocked microphone", async () => {
    setup(fakeVoice({ denied: "Allow microphone access." }));
    fireEvent.click(testButton());
    await elapse(0);
    expect(screen.getByText("Allow microphone access.")).toBeDefined();
  });

  it("plays the interviewer's voice", async () => {
    const voice = fakeVoice();
    setup(voice);
    expect(screen.getByText("Hear how your interviewer sounds.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await elapse(0);
    expect(voice.spoken).toEqual([SAMPLE_LINE]);
    expect(screen.getByText(/^Played/)).toBeDefined();
  });

  it("stops the test when the page closes", async () => {
    const voice = fakeVoice();
    const { unmount } = setup(voice);
    unmount();
    const testing = fakeVoice();
    const running = setup(testing);
    fireEvent.click(testButton());
    await elapse(100);
    running.unmount();
    await elapse(100);
    expect([voice.events, testing.events]).toEqual([[], ["listen", "cancel"]]);
  });
});
