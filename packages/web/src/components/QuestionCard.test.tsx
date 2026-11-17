// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../test-support/dom.js";
import { question } from "../test-support/views.js";
import { QuestionCard } from "./QuestionCard.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(view = question, busy = false): { readonly onSubmit: ReturnType<typeof vi.fn>; readonly onStop: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn<(answer: string) => void>();
  const onStop = vi.fn<() => void>();
  render(<QuestionCard view={view} busy={busy} onSubmit={onSubmit} onStop={onStop} />);
  return { onSubmit, onStop };
}

function elapse(seconds: number): void {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

const answerBox = (): HTMLElement => screen.getByLabelText("Your answer");
const submitButton = (): HTMLElement => screen.getByRole("button", { name: "Submit answer" });

describe("QuestionCard", () => {
  it("shows the question and submits a typed answer", () => {
    const { onSubmit } = setup();
    expect(screen.getByRole("heading", { name: question.text })).toBeDefined();
    expect(screen.getByText("Question 1 of up to 2")).toBeDefined();
    expect(submitButton()).toHaveProperty("disabled", true);
    fireEvent.change(answerBox(), { target: { value: "I escalated it" } });
    expect(screen.getByText("3 words · Ctrl+Enter to submit")).toBeDefined();
    fireEvent.click(submitButton());
    expect(onSubmit).toHaveBeenCalledWith("I escalated it");
  });

  it("submits with Ctrl+Enter or Cmd+Enter only", () => {
    const { onSubmit } = setup();
    fireEvent.change(answerBox(), { target: { value: "Answer" } });
    fireEvent.keyDown(answerBox(), { key: "Enter" });
    fireEvent.keyDown(answerBox(), { key: "a", ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(answerBox(), { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(answerBox(), { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("ignores Ctrl+Enter while the answer is blank", () => {
    const { onSubmit } = setup();
    fireEvent.keyDown(answerBox(), { key: "Enter", ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("stops the clock once the answer is submitted, so a slow evaluation is not cut off", () => {
    const { onSubmit } = setup();
    fireEvent.change(answerBox(), { target: { value: "Done" } });
    elapse(5);
    fireEvent.click(submitButton());
    elapse(200);
    expect(screen.getByRole("timer").textContent).toBe("0:05 of 1:00 suggested");
    expect(onSubmit).toHaveBeenCalledOnce();
    fireEvent.click(submitButton());
    expect(screen.getByRole("timer").textContent).toBe("0:05 of 1:00 suggested");
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("lets the candidate end the interview", () => {
    const { onStop } = setup();
    fireEvent.click(screen.getByRole("button", { name: "End interview" }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("locks the form while the answer is evaluated", () => {
    setup({ ...question, followUp: true }, true);
    expect(screen.getByText("Follow-up")).toBeDefined();
    expect(answerBox()).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Evaluating…" })).toHaveProperty("disabled", true);
  });

  it("counts down preparation, then the suggested time, then cuts the answer off", () => {
    const { onSubmit } = setup({ ...question, prepSeconds: 10 });
    expect(screen.getByRole("timer").textContent).toBe("Preparation: 0:10 left");
    elapse(10);
    expect(screen.getByRole("timer").textContent).toBe("0:00 of 1:00 suggested");
    fireEvent.change(answerBox(), { target: { value: "Partial" } });
    elapse(60);
    expect(screen.getByRole("timer").textContent).toBe("Over the suggested time: 0:30 until the cut-off");
    elapse(30);
    expect(screen.getByRole("timer").textContent).toBe("Time is up");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Partial");
    elapse(5);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(submitButton()).toHaveProperty("disabled", false);
  });
});
