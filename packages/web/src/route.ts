import { useSyncExternalStore } from "react";

/** Pages are addressed by the URL hash, so reloads and the back button work without server routes. */
export type Route =
  | { readonly page: "home" }
  | { readonly page: "history" }
  | { readonly page: "setup"; readonly interviewId: string }
  | { readonly page: "session"; readonly sessionId: string };

const PATTERNS: readonly [RegExp, (id: string) => Route][] = [
  [/^#\/practice\/([^/]+)$/, (interviewId): Route => ({ page: "setup", interviewId })],
  [/^#\/session\/([^/]+)$/, (sessionId): Route => ({ page: "session", sessionId })],
];

function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function parseRoute(hash: string): Route {
  if (hash === "#/history") {
    return { page: "history" };
  }
  for (const [pattern, build] of PATTERNS) {
    const id = pattern.exec(hash)?.[1];
    const decoded = id === undefined ? undefined : decode(id);
    if (decoded !== undefined) {
      return build(decoded);
    }
  }
  return { page: "home" };
}

export function hrefFor(route: Route): string {
  switch (route.page) {
    case "home":
      return "#/";
    case "history":
      return "#/history";
    case "setup":
      return `#/practice/${encodeURIComponent(route.interviewId)}`;
    case "session":
      return `#/session/${encodeURIComponent(route.sessionId)}`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = hrefFor(route);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
  };
}

function currentHash(): string {
  return window.location.hash;
}

/** The current route, updated when the hash changes. */
export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, currentHash));
}
