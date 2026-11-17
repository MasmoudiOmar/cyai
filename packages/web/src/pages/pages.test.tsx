// @vitest-environment jsdom
import { SESSION_ID } from "@cyai/fixtures";
import { err, ok, type PracticeView, type Result, type SessionSummary, type StartPractice } from "@cyai/spec";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { deferred } from "../test-support/deferred.js";
import "../test-support/dom.js";
import { abandoned, completed, fakeApi, interview, question, session } from "../test-support/views.js";
import { HistoryPage } from "./HistoryPage.js";
import { HomePage } from "./HomePage.js";
import { SessionPage } from "./SessionPage.js";
import { SetupPage } from "./SetupPage.js";

const OTHER_ID = "0b6c2d3e-4a5b-4c6d-8e7f-901234567891";
const STOPPED_ID = "1c7d3e4f-5a6b-4c7d-8e9f-012345678912";

const open: SessionSummary = { sessionId: OTHER_ID, interviewId: "retired-interview", status: "awaiting_answer", createdAt: session.createdAt };
const stopped: SessionSummary = { sessionId: STOPPED_ID, interviewId: interview.id, status: "abandoned", createdAt: session.createdAt };

async function goTo(hash: string): Promise<void> {
  await act(async () => {
    window.location.hash = hash;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("HomePage", () => {
  it("introduces the app, summarises progress and lists interviews and recent sessions", async () => {
    render(<HomePage api={fakeApi({ sessions: () => Promise.resolve(ok([open, session, stopped])) })} />);
    expect(screen.getByRole("status", { name: "Loading interviews" })).toBeDefined();
    expect(await screen.findByRole("heading", { name: "AI Trainer" })).toBeDefined();
    expect(screen.getByRole("link", { name: /Start practising/ }).getAttribute("href")).toBe("#/practice/ai-trainer-generalist");
    expect(screen.getAllByText("Live adaptive")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Start interview/ }).getAttribute("href")).toBe("#/practice/ai-trainer-generalist");

    expect(screen.getByText("You have an interview in progress")).toBeDefined();
    expect(screen.getByRole("link", { name: /^Continue/ }).getAttribute("href")).toBe(`#/session/${OTHER_ID}`);
    expect(screen.getByText("Sessions").nextSibling?.textContent).toBe("3");
    expect(screen.getByText("Best score").nextSibling?.textContent).toBe("3.6");

    // Sessions show the interview's role, or a readable id when it is no longer installed.
    expect(screen.getAllByText("Retired interview").length).toBe(2);
    expect(screen.getByText("Stopped")).toBeDefined();
    expect(screen.getAllByText("AI Trainer").length).toBeGreaterThan(1);
  });

  it("stays quiet when nothing is installed or practised yet", async () => {
    render(<HomePage api={fakeApi({ interviews: () => Promise.resolve(ok([])), sessions: () => Promise.resolve(ok([])) })} />);
    expect(await screen.findByText(/No interviews are installed/)).toBeDefined();
    expect(screen.getByText(/No sessions yet/)).toBeDefined();
    expect(screen.queryByRole("link", { name: /Start practising/ })).toBeNull();
    expect(screen.queryByText("Sessions")).toBeNull();
  });

  it("shows dashes until a session is completed", async () => {
    render(<HomePage api={fakeApi({ sessions: () => Promise.resolve(ok([stopped])) })} />);
    expect((await screen.findByText("Best score")).nextSibling?.textContent).toBe("–");
    expect(screen.queryByText("You have an interview in progress")).toBeNull();
  });

  it("offers a retry when loading fails", async () => {
    const interviews = vi.fn().mockResolvedValueOnce(err("Server down")).mockResolvedValue(ok([]));
    render(<HomePage api={fakeApi({ interviews })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No interviews are installed/)).toBeDefined();
    expect(interviews).toHaveBeenCalledTimes(2);
  });
});

describe("HistoryPage", () => {
  it("lists every session", async () => {
    render(<HistoryPage api={fakeApi({ sessions: () => Promise.resolve(ok([session, stopped])) })} />);
    expect(await screen.findByRole("heading", { name: "Every session you have practised" })).toBeDefined();
    await waitFor(() => {
      expect(screen.getAllByText("AI Trainer")).toHaveLength(2);
    });
  });

  it("falls back to ids while interviews are unavailable", async () => {
    render(<HistoryPage api={fakeApi({ interviews: () => Promise.resolve(err("down")) })} />);
    expect(await screen.findByText("Ai trainer generalist")).toBeDefined();
  });
});

describe("SetupPage", () => {
  it("explains the interview and starts it with the candidate's context", async () => {
    const start = vi.fn<(input: StartPractice) => Promise<Result<PracticeView, string>>>().mockResolvedValue(ok(question));
    render(<SetupPage api={fakeApi({ start })} interviewId="ai-trainer-generalist" />);
    expect(await screen.findByText("No prep time: aim for 1:00 per answer, cut off at 1:30")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Resume"), { target: { value: "Annotator" } });
    fireEvent.change(screen.getByLabelText("Job description"), { target: { value: "Rank outputs." } });
    fireEvent.click(screen.getByRole("button", { name: /Start interview/ }));
    expect(screen.getByRole("button", { name: /Preparing your interview/ })).toHaveProperty("disabled", true);
    await waitFor(() => {
      expect(window.location.hash).toBe(`#/session/${SESSION_ID}`);
    });
    expect(start).toHaveBeenCalledWith({ interviewId: "ai-trainer-generalist", resume: "Annotator", jobDescription: "Rank outputs." });
  });

  it("mentions preparation time and shows why an interview could not start", async () => {
    const api = fakeApi({
      interviews: () => Promise.resolve(ok([{ ...interview, prepSeconds: 30 }])),
      start: () => Promise.resolve(err("No API key.")),
    });
    render(<SetupPage api={api} interviewId="ai-trainer-generalist" />);
    expect(await screen.findByText("30s to prepare, then aim for 1:00 per answer, cut off at 1:30")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Start interview/ }));
    expect(await screen.findByText("No API key.")).toBeDefined();
    expect(screen.getByRole("button", { name: /Start interview/ })).toHaveProperty("disabled", false);
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
    fireEvent.click(screen.getByRole("button", { name: /Submit answer/ }));
    expect(screen.getByText("Your interviewer is evaluating your answer")).toBeDefined();
    await act(async () => {
      pending.resolve(ok(completed));
      await pending.promise;
    });
    expect(screen.getByText("Question by question")).toBeDefined();
  });

  it("keeps the answer when submitting fails", async () => {
    render(<SessionPage api={fakeApi({ answer: () => Promise.resolve(err("The model is overloaded.")) })} sessionId={SESSION_ID} />);
    fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "My answer" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit answer/ }));
    expect(await screen.findByText("The model is overloaded.")).toBeDefined();
    expect(screen.getByLabelText<HTMLTextAreaElement>("Your answer").value).toBe("My answer");
  });

  it("ends the interview on request and offers a fresh start", async () => {
    render(<SessionPage api={fakeApi()} sessionId={SESSION_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: /End interview/ }));
    expect(await screen.findByText("This interview was stopped")).toBeDefined();
    expect(screen.getByText(new RegExp(abandoned.reason))).toBeDefined();
    expect(screen.getByRole("link", { name: /Start again/ }).getAttribute("href")).toBe("#/practice/ai-trainer-generalist");
  });

  it("opens finished sessions on their result", async () => {
    render(<SessionPage api={fakeApi({ session: () => Promise.resolve(ok(completed)) })} sessionId={SESSION_ID} />);
    expect(await screen.findByText("Scores by criterion")).toBeDefined();
  });
});

describe("App", () => {
  it("shows the interviewer model and highlights the current section", async () => {
    render(<App api={fakeApi()} />);
    expect(await screen.findByText("claude-opus-5-5")).toBeDefined();
    expect(screen.getByText(/cyai 0\.1\.0/)).toBeDefined();
    const nav = (name: string): string | null => screen.getByRole("link", { name }).getAttribute("aria-current");
    expect([nav("Interviews"), nav("History")]).toEqual(["page", null]);

    await goTo("#/history");
    expect(await screen.findByRole("heading", { name: "Every session you have practised" })).toBeDefined();
    expect([nav("Interviews"), nav("History")]).toEqual([null, "page"]);

    await goTo("#/practice/ai-trainer-generalist");
    expect(await screen.findByRole("button", { name: /Start interview/ })).toBeDefined();
    expect(nav("Interviews")).toBe("page");

    await goTo(`#/session/${SESSION_ID}`);
    expect(await screen.findByLabelText("Your answer")).toBeDefined();
    expect([nav("Interviews"), nav("History")]).toEqual([null, null]);
  });

  it("ignores a load that finishes after the page changed", async () => {
    const slow = deferred<Result<PracticeView, string>>();
    window.location.hash = `#/session/${SESSION_ID}`;
    render(<App api={fakeApi({ session: () => slow.promise, info: () => Promise.resolve(err("offline")) })} />);
    await goTo("#/");
    await act(async () => {
      slow.resolve(ok(question));
      await slow.promise;
    });
    expect(screen.queryByLabelText("Your answer")).toBeNull();
    expect(screen.getByText(/^cyai · Practice only/)).toBeDefined();
  });
});
