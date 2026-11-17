import type { JSX } from "react";

import type { Loadable } from "../use-load.js";
import { Notice, Spinner } from "./Notice.js";

/** Shows a spinner, an error with a retry button, or the loaded content. */
export function Loading<T>({
  loadable,
  label,
  onRetry,
  children,
}: {
  readonly loadable: Loadable<T>;
  readonly label: string;
  readonly onRetry: () => void;
  readonly children: (value: T) => JSX.Element;
}): JSX.Element {
  switch (loadable.state) {
    case "loading":
      return <Spinner label={label} />;
    case "error":
      return <Notice message={loadable.message} onRetry={onRetry} />;
    case "ready":
      return children(loadable.value);
  }
}
