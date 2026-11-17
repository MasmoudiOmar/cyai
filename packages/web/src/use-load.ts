import { useCallback, useEffect, useRef, useState } from "react";

import type { ApiResult } from "./api.js";

export type Loadable<T> =
  | { readonly state: "loading" }
  | { readonly state: "error"; readonly message: string }
  | { readonly state: "ready"; readonly value: T };

export interface Loaded<T> {
  readonly current: Loadable<T>;
  readonly reload: () => void;
}

const LOADING = { state: "loading" } as const;

/**
 * Runs `load` whenever `key` changes (or `reload` is called) and tracks its outcome.
 * Results of superseded loads are dropped.
 */
export function useLoad<T>(key: string, load: () => ApiResult<T>): Loaded<T> {
  const loadRef = useRef(load);
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ readonly token: string; readonly value: Loadable<T> } | undefined>();
  const token = `${key}\u0000${String(attempt)}`;

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let live = true;
    void loadRef.current().then((result) => {
      if (live) {
        setSettled({ token, value: result.ok ? { state: "ready", value: result.value } : { state: "error", message: result.error } });
      }
    });
    return (): void => {
      live = false;
    };
  }, [token]);

  const reload = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  return { current: settled?.token === token ? settled.value : LOADING, reload };
}
