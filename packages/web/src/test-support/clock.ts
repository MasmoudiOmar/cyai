import { act } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

/** Runs every test in the importing file on a fake clock. */
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Moves the fake clock on, letting React and pending promises catch up. */
export async function elapse(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
