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
const clock = (): string | null => screen.getByRole("timer").textContent;
const caption = (text: string): HTMLElement => screen.getByText(text);

describe("QuestionCard", () => {
  it("shows the question and submits a typed answer", () => {
    const { onSubmit } = setup();
    expect(screen.getByRole("heading", { name: question.text })).toBeDefined();
    expect(screen.getByText("AI Trainer · Question 1 of up to 2")).toBeDefined();
    expect(submitButton()).toHaveProperty("disabled", true);
    fireEvent.change(answerBox(), { target: { value: "Escalated" } });
    expect(screen.getByText(/^1 word ·/)).toBeDefined();
    fireEvent.change(answerBox(), { target: { value: "I escalated it" } });
    expect(screen.getByText(/^3 words ·/)).toBeDefined();
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
    expect(clock()).toBe("0:05");
    expect(onSubmit).toHaveBeenCalledOnce();
    fireEvent.click(submitButton());
    expect(clock()).toBe("0:05");
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("lets the candidate end the interview", () => {
    const { onStop } = setup();
    fireEvent.click(screen.getByRole("button", { name: "End interview" }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("shows progress, follow-ups and the evaluating state", () => {
    const { container } = render(<span />);
    setup({ ...question, number: 2, followUp: true }, true);
    expect(screen.getByText("Follow-up")).toBeDefined();
    expect(answerBox()).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Evaluating…" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("status").textContent).toContain("Your interviewer is evaluating your answer");
    expect(container.ownerDocument.querySelectorAll(".steps .done")).toHaveLength(1);
    expect(container.ownerDocument.querySelectorAll(".steps .current")).toHaveLength(1);
  });

  it("counts down preparation, then the suggested time, then cuts the answer off", () => {
    const { onSubmit } = setup({ ...question, prepSeconds: 10 });
    expect(clock()).toBe("0:10");
    expect(caption("Gather your thoughts. The answer clock starts next.")).toBeDefined();
    elapse(10);
    expect(clock()).toBe("0:00");
    expect(caption("Aim for 1:00. Cut-off at 1:30.")).toBeDefined();
    fireEvent.change(answerBox(), { target: { value: "Partial" } });
    elapse(60);
    expect(clock()).toBe("0:30");
    expect(caption("Over the suggested time: wrap up.")).toBeDefined();
    elapse(30);
    expect(clock()).toBe("0:00");
    expect(caption("Time is up")).toBeDefined();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Partial");
    elapse(5);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(submitButton()).toHaveProperty("disabled", false);
  });
});
