import type { JSX } from "react";

import type { ApiClient } from "./api.js";
import { HomePage } from "./pages/HomePage.js";
import { SessionPage } from "./pages/SessionPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { hrefFor, useRoute, type Route } from "./route.js";
import { useLoad } from "./use-load.js";

function Page({ api, route }: { readonly api: ApiClient; readonly route: Route }): JSX.Element {
  switch (route.page) {
    case "home":
      return <HomePage api={api} />;
    case "setup":
      return <SetupPage key={route.interviewId} api={api} interviewId={route.interviewId} />;
    case "session":
      return <SessionPage key={route.sessionId} api={api} sessionId={route.sessionId} />;
  }
}

export function App({ api }: { readonly api: ApiClient }): JSX.Element {
  const route = useRoute();
  const info = useLoad("info", api.info);
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={hrefFor({ page: "home" })}>
          <span className="logo" aria-hidden="true">
            cy
          </span>
          CrackYourAIInterview
        </a>
        {info.current.state === "ready" ? (
          <span className="muted model">Interviewer model: {info.current.value.model}</span>
        ) : null}
      </header>
      <main className="content">
        <Page api={api} route={route} />
      </main>
      <footer className="footer muted">
        {info.current.state === "ready" ? `cyai ${info.current.value.version} · ` : null}
        For practice only. Never use it during a real interview.
      </footer>
    </div>
  );
}
