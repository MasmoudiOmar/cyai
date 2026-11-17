// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import type { JSX } from "react";
import { describe, expect, it } from "vitest";

import { hrefFor, navigate, parseRoute, useRoute } from "./route.js";
import "./test-support/dom.js";

function Probe(): JSX.Element {
  return <p>{JSON.stringify(useRoute())}</p>;
}

describe("routes", () => {
  it.each([
    ["", { page: "home" }],
    ["#/", { page: "home" }],
    ["#/practice/swe%20screen", { page: "setup", interviewId: "swe screen" }],
    ["#/session/abc", { page: "session", sessionId: "abc" }],
    ["#/session/%E0%A4%A", { page: "home" }],
    ["#/elsewhere", { page: "home" }],
  ])("parses %j", (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it("round-trips every page through its href", () => {
    for (const route of [{ page: "home" }, { page: "setup", interviewId: "a b" }, { page: "session", sessionId: "c" }] as const) {
      expect(parseRoute(hrefFor(route))).toEqual(route);
    }
  });

  it("follows hash changes", async () => {
    render(<Probe />);
    expect(screen.getByText('{"page":"home"}')).toBeDefined();
    await act(async () => {
      navigate({ page: "session", sessionId: "s1" });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText('{"page":"session","sessionId":"s1"}')).toBeDefined();
  });
});
