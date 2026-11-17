// @vitest-environment jsdom
import { SESSION_ID } from "@cyai/fixtures";
import { err, ok, type PracticeView, type Result, type StartPractice } from "@cyai/spec";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { deferred } from "../test-support/deferred.js";
import "../test-support/dom.js";
import { abandoned, completed, fakeApi, question } from "../test-support/views.js";
import { HomePage } from "./HomePage.js";
import { SessionPage } from "./SessionPage.js";
import { SetupPage } from "./SetupPage.js";

describe("HomePage", () => {
  it("lists interviews and past sessions", async () => {
    render(<HomePage api={fakeApi()} />);
    expect(screen.getByText("Loading interviews…")).toBeDefined();
    expect(await screen.findByRole("heading", { name: "AI Trainer" })).toBeDefined();
    expect(screen.getByText("Live adaptive")).toBeDefined();
    expect(screen.getByRole("link", { name: "Practise" }).getAttribute("href")).toBe("#/practice/ai-trainer-generalist");
    expect(screen.getByRole("link", { name: "ai-trainer-generalist" }).getAttribute("href")).toBe(`#/session/${SESSION_ID}`);
    expect(screen.getByText("Completed")).toBeDefined();
    expect(screen.getByText("3.6")).toBeDefined();
  });

  it("explains empty lists and scores of unfinished sessions", async () => {
    const unfinished = { sessionId: SESSION_ID, interviewId: "x", status: "awaiting_answer", createdAt: "2026-01-01T09:00:00.000Z" } as const;
    render(<HomePage api={fakeApi({ interviews: () => Promise.resolve(ok([])), sessions: () => Promise.resolve(ok([unfinished])) })} />);
    expect(await screen.findByText(/No interviews are installed/)).toBeDefined();
    expect(screen.getByText("–")).toBeDefined();
  });

  it("shows an empty history", async () => {
    render(<HomePage api={fakeApi({ sessions: () => Promise.resolve(ok([])) })} />);
    expect(await screen.findByText(/No sessions yet/)).toBeDefined();
  });

  it("offers a retry when loading fails", async () => {
    const interviews = vi.fn().mockResolvedValueOnce(err("Server down")).mockResolvedValue(ok([]));
    render(<HomePage api={fakeApi({ interviews })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No interviews are installed/)).toBeDefined();
    expect(interviews).toHaveBeenCalledTimes(2);
  });
});

describe("SetupPage", () => {
  it("starts the interview with the candidate's context and opens the session", async () => {
    const start = vi.fn<(input: StartPractice) => Promise<Result<PracticeView, string>>>().mockResolvedValue(ok(question));
    render(<SetupPage api={fakeApi({ start })} interviewId="ai-trainer-generalist" />);
    fireEvent.change(await screen.findByLabelText(/^Resume \(optional\)/), { target: { value: "Annotator" } });
    const file = new File(["Rank outputs."], "jd.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Job description file"), { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLTextAreaElement>(/^Job description \(optional\)/).value).toBe("Rank outputs.");
    });
    fireEvent.change(screen.getByLabelText("Resume file"), { target: { files: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
    expect(screen.getByRole("button", { name: "Preparing your interview…" })).toHaveProperty("disabled", true);
    await waitFor(() => {
      expect(window.location.hash).toBe(`#/session/${SESSION_ID}`);
    });
    expect(start).toHaveBeenCalledWith({ interviewId: "ai-trainer-generalist", resume: "Annotator", jobDescription: "Rank outputs." });
  });

  it("shows why the interview could not start", async () => {
    render(<SetupPage api={fakeApi({ start: () => Promise.resolve(err("No API key.")) })} interviewId="ai-trainer-generalist" />);
    fireEvent.click(await screen.findByRole("button", { name: "Start interview" }));
    expect(await screen.findByText("No API key.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Start interview" })).toHaveProperty("disabled", false);
  });

  it("reports unknown interviews", async () => {
    render(<SetupPage api={fakeApi()} interviewId="nope" />);
    expect(await screen.findByText('There is no interview "nope".')).toBeDefined();
  });
});

describe("SessionPage", () => {
  it("takes answers until the debrief", async () => {
    const pending = deferred<Result<PracticeView, string>>();
    render(<SessionPage api={fakeApi({ answer: () => pending.promise })} sessionId={SESSION_ID} />);
    fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "My answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(screen.getByText("The interviewer is reading your answer…")).toBeDefined();
    await act(async () => {
      pending.resolve(ok(completed));
      await pending.promise;
    });
    expect(screen.getByText("Pass · pass mark 3.5")).toBeDefined();
  });

  it("keeps the answer when submitting fails", async () => {
    render(<SessionPage api={fakeApi({ answer: () => Promise.resolve(err("The model is overloaded.")) })} sessionId={SESSION_ID} />);
    fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "My answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(await screen.findByText("The model is overloaded.")).toBeDefined();
    expect(screen.getByLabelText<HTMLTextAreaElement>("Your answer").value).toBe("My answer");
  });

  it("ends the interview on request", async () => {
    render(<SessionPage api={fakeApi()} sessionId={SESSION_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "End interview" }));
    expect(await screen.findByText("This interview was stopped")).toBeDefined();
    expect(screen.getByText(abandoned.reason)).toBeDefined();
  });

  it("opens finished sessions on their result", async () => {
    render(<SessionPage api={fakeApi({ session: () => Promise.resolve(ok(completed)) })} sessionId={SESSION_ID} />);
    expect(await screen.findByText("Feedback by question")).toBeDefined();
  });
});

describe("App", () => {
  it("shows the interviewer model and routes by hash", async () => {
    render(<App api={fakeApi()} />);
    expect(await screen.findByText("Interviewer model: claude-opus-5-5")).toBeDefined();
    expect(screen.getByText(/cyai 0\.1\.0/)).toBeDefined();
    await act(async () => {
      window.location.hash = "#/practice/ai-trainer-generalist";
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(await screen.findByRole("button", { name: "Start interview" })).toBeDefined();
    await act(async () => {
      window.location.hash = `#/session/${SESSION_ID}`;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(await screen.findByLabelText("Your answer")).toBeDefined();
  });

  it("ignores a load that finishes after the page changed", async () => {
    const slow = deferred<Result<PracticeView, string>>();
    window.location.hash = `#/session/${SESSION_ID}`;
    render(<App api={fakeApi({ session: () => slow.promise, info: () => Promise.resolve(err("offline")) })} />);
    await act(async () => {
      window.location.hash = "#/";
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      slow.resolve(ok(question));
      await slow.promise;
    });
    expect(screen.queryByLabelText("Your answer")).toBeNull();
    expect(screen.queryByText(/Interviewer model/)).toBeNull();
  });
});
