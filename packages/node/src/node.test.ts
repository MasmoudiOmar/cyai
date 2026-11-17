import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { createdSession, SESSION_ID } from "@cyai/fixtures";
import type { SessionRecord } from "@cyai/spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { errorMessage, isMissingPath } from "./errors.js";
import { createFileSessionStore } from "./file-store.js";
import { defaultDataDir, systemClock, templateDirectories, uuidGenerator } from "./system.js";

const OTHER_ID = "0b6c2d3e-4a5b-4c6d-8e7f-901234567891";
const record = (id = SESSION_ID, seconds = 0): SessionRecord => ({
  session: createdSession(id, seconds),
  candidate: { resume: "Annotator" },
});

let dataDir = "";

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "cyai-store-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("file session store", () => {
  it("saves, loads and lists records newest first, leaving no temp files", async () => {
    const store = createFileSessionStore(dataDir);
    expect(await store.save(record(SESSION_ID, 0))).toEqual({ ok: true, value: record(SESSION_ID, 0) });
    await store.save(record(OTHER_ID, 60));
    expect(await store.load(SESSION_ID)).toEqual({ ok: true, value: record(SESSION_ID, 0) });
    const listed = await store.list();
    expect(listed.ok ? listed.value.map((item) => item.session.id) : []).toEqual([OTHER_ID, SESSION_ID]);
    expect(await readdir(join(dataDir, "sessions"))).toEqual(expect.not.arrayContaining([expect.stringMatching(/\.tmp$/)]));
  });

  it("lists nothing before any session is saved", async () => {
    expect(await createFileSessionStore(dataDir).list()).toEqual({ ok: true, value: [] });
  });

  it.each([
    ["an unknown session", SESSION_ID, "not_found"],
    ["a non-UUID id (path traversal guard)", "../../etc/passwd", "not_found"],
  ])("reports %s", async (_case, id, reason) => {
    expect(await createFileSessionStore(dataDir).load(id)).toMatchObject({ ok: false, error: { reason } });
  });

  it.each([
    ["invalid JSON", "{ nope", "is not valid JSON"],
    ["a schema violation", JSON.stringify({ session: {}, candidate: {} }), "session.status"],
  ])("reports %s as corrupt, also when listing", async (_case, content, message) => {
    await mkdir(join(dataDir, "sessions"), { recursive: true });
    await writeFile(join(dataDir, "sessions", `${SESSION_ID}.json`), content);
    const store = createFileSessionStore(dataDir);
    const loaded = await store.load(SESSION_ID);
    expect(loaded).toMatchObject({ ok: false, error: { code: "store_error", reason: "corrupt" } });
    expect(loaded.ok ? "" : loaded.error.message).toContain(message);
    expect((await store.list()).ok).toBe(false);
  });

  it("refuses to save a record whose id is not a UUID", async () => {
    const bad = { ...record(), session: { ...createdSession(), id: "not-a-uuid" } };
    expect(await createFileSessionStore(dataDir).save(bad)).toMatchObject({ ok: false, error: { reason: "not_found" } });
  });

  it("reports I/O failures when the data folder is unusable", async () => {
    const blocked = join(dataDir, "blocked");
    await writeFile(blocked, "a file, not a folder");
    const store = createFileSessionStore(blocked);
    expect(await store.save(record())).toMatchObject({ ok: false, error: { reason: "io" } });
    expect(await store.list()).toMatchObject({ ok: false, error: { reason: "io" } });
    expect(await store.load(SESSION_ID)).toMatchObject({ ok: false, error: { reason: "io" } });
  });
});

describe("system adapters", () => {
  it("uses CYAI_HOME when set, otherwise ~/.cyai", () => {
    expect(defaultDataDir({ CYAI_HOME: "/data/cyai" })).toBe("/data/cyai");
    expect(defaultDataDir({ CYAI_HOME: "" })).toMatch(/\.cyai$/);
    expect(defaultDataDir()).toMatch(/cyai/);
  });

  it("reads extra template folders from CYAI_TEMPLATES", () => {
    expect(templateDirectories({ CYAI_TEMPLATES: `/a${delimiter}${delimiter}/b` })).toEqual(["/a", "/b"]);
    expect(templateDirectories({})).toEqual([]);
    expect(Array.isArray(templateDirectories())).toBe(true);
  });

  it("provides real time and UUIDs", () => {
    expect(systemClock.now().getTime()).toBeGreaterThan(0);
    expect(uuidGenerator.next()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("describes thrown values and detects missing paths", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
    const timeout = new Error("fetch failed", { cause: new Error("Headers Timeout Error", { cause: "socket" }) });
    expect(errorMessage(timeout)).toBe("fetch failed (Headers Timeout Error)");
    expect(isMissingPath(Object.assign(new Error("x"), { code: "ENOENT" }))).toBe(true);
    expect(isMissingPath("ENOENT")).toBe(false);
  });
});
