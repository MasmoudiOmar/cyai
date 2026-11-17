import type { JSX } from "react";

import type { Loadable } from "../use-load.js";
import { Notice, Skeleton } from "./Notice.js";

interface LoadingProps<T> {
  readonly loadable: Loadable<T>;
  readonly label: string;
  readonly onRetry: () => void;
  readonly children: (value: T) => JSX.Element;
}

/** Shows placeholders, an error with a retry button, or the loaded content. */
export function Loading<T>({ loadable, label, onRetry, children }: LoadingProps<T>): JSX.Element {
  switch (loadable.state) {
    case "loading":
      return <Skeleton label={label} />;
    case "error":
      return <Notice message={loadable.message} onRetry={onRetry} />;
    case "ready":
      return children(loadable.value);
  }
}
