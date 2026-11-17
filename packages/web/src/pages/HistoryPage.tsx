import type { JSX } from "react";

import type { ApiClient } from "../api.js";
import { Loading } from "../components/Loading.js";
import { SessionList } from "../components/SessionList.js";
import { useLoad } from "../use-load.js";

export function HistoryPage({ api }: { readonly api: ApiClient }): JSX.Element {
  const sessions = useLoad("sessions", api.sessions);
  const interviews = useLoad("interviews", api.interviews);
  const roles = interviews.current.state === "ready" ? interviews.current.value : [];
  return (
    <>
      <p className="eyebrow">History</p>
      <h1 className="display page-title">Every session you have practised</h1>
      <Loading loadable={sessions.current} label="Loading sessions" onRetry={sessions.reload}>
        {(value) => <SessionList sessions={value} interviews={roles} />}
      </Loading>
    </>
  );
}
