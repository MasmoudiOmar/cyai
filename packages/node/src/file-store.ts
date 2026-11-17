import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SessionStore, StoreError } from "@cyai/core";
import {
  describeIssues,
  err,
  ok,
  sessionIdSchema,
  sessionRecordSchema,
  type Result,
  type SessionRecord,
} from "@cyai/spec";

import { errorMessage, isMissingPath } from "./errors.js";

const EXTENSION = ".json";

type Stored<T> = Result<T, StoreError>;

function fail(reason: StoreError["reason"], message: string): Stored<never> {
  return err({ code: "store_error", reason, message });
}

function parseRecord(file: string, text: string): Stored<SessionRecord> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("corrupt", `${file} is not valid JSON`);
  }
  const record = sessionRecordSchema.safeParse(raw);
  return record.success ? ok(record.data) : fail("corrupt", `${file}: ${describeIssues(record.error)}`);
}

/** Stores one JSON file per session under `<dataDir>/sessions`, written atomically. */
export function createFileSessionStore(dataDir: string): SessionStore {
  const directory = join(dataDir, "sessions");

  const fileFor = (sessionId: string): Stored<string> =>
    sessionIdSchema.safeParse(sessionId).success
      ? ok(join(directory, `${sessionId}${EXTENSION}`))
      : fail("not_found", `Not a session id: ${sessionId}`);

  const load = async (sessionId: string): Promise<Stored<SessionRecord>> => {
    const file = fileFor(sessionId);
    if (!file.ok) {
      return file;
    }
    try {
      return parseRecord(file.value, await readFile(file.value, "utf8"));
    } catch (error) {
      return isMissingPath(error) ? fail("not_found", `No session ${sessionId}`) : fail("io", errorMessage(error));
    }
  };

  const save = async (record: SessionRecord): Promise<Stored<SessionRecord>> => {
    const file = fileFor(record.session.id);
    if (!file.ok) {
      return file;
    }
    const temporary = `${file.value}.tmp`;
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      await rename(temporary, file.value);
      return ok(record);
    } catch (error) {
      return fail("io", errorMessage(error));
    }
  };

  const list = async (): Promise<Stored<readonly SessionRecord[]>> => {
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      return isMissingPath(error) ? ok([]) : fail("io", errorMessage(error));
    }
    const records: SessionRecord[] = [];
    for (const name of names.filter((entry) => entry.endsWith(EXTENSION))) {
      const record = await load(name.slice(0, -EXTENSION.length));
      if (!record.ok) {
        return record;
      }
      records.push(record.value);
    }
    return ok(records.sort((a, b) => b.session.createdAt.localeCompare(a.session.createdAt)));
  };

  return { load, save, list };
}
