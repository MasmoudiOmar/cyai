import type { JSX } from "react";

interface NoticeProps {
  readonly message: string;
  readonly onRetry?: () => void;
}

export function Notice({ message, onRetry }: NoticeProps): JSX.Element {
  return (
    <div className="notice" role="alert">
      <p>{message}</p>
      {onRetry === undefined ? null : (
        <button type="button" className="button secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Spinner({ label }: { readonly label: string }): JSX.Element {
  return (
    <p className="spinner" role="status">
      <span className="spinner-dot" aria-hidden="true" />
      {label}
    </p>
  );
}
