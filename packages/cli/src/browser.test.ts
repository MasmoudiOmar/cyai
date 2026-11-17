import { describe, expect, it } from "vitest";

import { detachedSpawn, openCommand, openInBrowser, type Spawn } from "./browser.js";

const URL = "http://localhost:4477";

type Calls = (readonly [string, readonly string[]])[];

function fakeSpawn(behaviour: "ok" | "error" | "throw", calls: Calls): Spawn {
  return (command, args) => {
    calls.push([command, args]);
    if (behaviour === "throw") {
      throw new Error("spawn failed");
    }
    return {
      on: (_event, listener): void => {
        if (behaviour === "error") {
          listener(new Error("ENOENT"));
        }
      },
      unref: (): void => undefined,
    };
  };
}

describe("openInBrowser", () => {
  it.each([
    ["darwin", ["open", [URL]]],
    ["win32", ["cmd", ["/c", "start", "", URL]]],
    ["linux", ["xdg-open", [URL]]],
  ] as const)("uses the %s opener", (platform, expected) => {
    expect(openCommand(URL, { platform, env: {} })).toEqual(expected);
    expect(openCommand(URL, { platform, env: { BROWSER: "" } })).toEqual(expected);
  });

  it("prefers $BROWSER", () => {
    expect(openCommand(URL, { platform: "linux", env: { BROWSER: "firefox" } })).toEqual(["firefox", [URL]]);
  });

  it("reports whether a browser was launched", async () => {
    const calls: Calls = [];
    const options = { platform: "linux", env: {} } as const;
    await expect(openInBrowser(URL, { ...options, run: fakeSpawn("ok", calls) })).resolves.toBe(true);
    await expect(openInBrowser(URL, { ...options, run: fakeSpawn("error", calls) })).resolves.toBe(false);
    await expect(openInBrowser(URL, { ...options, run: fakeSpawn("throw", calls) })).resolves.toBe(false);
    expect(calls).toHaveLength(3);
  });

  it("spawns real programs detached", async () => {
    // Node with an empty script exits at once, so nothing is opened.
    const launched = openInBrowser(URL, { platform: "linux", env: { BROWSER: process.execPath }, run: detachedSpawn });
    await expect(launched).resolves.toBe(true);
    await expect(openInBrowser(URL, { platform: "linux", env: { BROWSER: "/nonexistent/browser" }, run: detachedSpawn })).resolves.toBe(false);
  });
});
