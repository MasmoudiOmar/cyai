import type { JSX } from "react";

import { Icon } from "./Icon.js";

interface NoticeProps {
  readonly message: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
}

export function Notice({ message, onRetry, retryLabel = "Try again" }: NoticeProps): JSX.Element {
  return (
    <div className="notice" role="alert">
      <Icon name="alert" />
      <p>{message}</p>
      {onRetry === undefined ? null : (
        <button type="button" className="button ghost" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/** Placeholder cards shown while content loads. */
export function Skeleton({ label, count = 3 }: { readonly label: string; readonly count?: number }): JSX.Element {
  return (
    <div className="skeleton-grid" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="skeleton" />
      ))}
    </div>
  );
}
