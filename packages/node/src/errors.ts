/**
 * Human-readable message for any thrown value, including its cause.
 * `fetch` reports every network problem as "fetch failed"; the cause says which one.
 */
export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  return error.cause instanceof Error ? `${error.message} (${errorMessage(error.cause)})` : error.message;
}

/** True when a filesystem call failed because the path does not exist. */
export function isMissingPath(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
