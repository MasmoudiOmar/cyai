import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

import type { Clock, IdGenerator } from "@cyai/core";

export const systemClock: Clock = { now: () => new Date() };

export const uuidGenerator: IdGenerator = { next: () => randomUUID() };

/** Where cyai keeps local data: `$CYAI_HOME`, or `~/.cyai`. */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env["CYAI_HOME"];
  return configured !== undefined && configured.length > 0 ? configured : join(homedir(), ".cyai");
}

/** Extra template folders from `$CYAI_TEMPLATES` (separated like PATH). */
export function templateDirectories(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  return (env["CYAI_TEMPLATES"] ?? "").split(delimiter).filter((entry) => entry.length > 0);
}
