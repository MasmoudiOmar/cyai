import type { VoiceInfo } from "@cyai/spec";
import { useMemo, type JSX } from "react";

import type { ApiClient } from "./api.js";
import { Icon } from "./components/Icon.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { HomePage } from "./pages/HomePage.js";
import { SessionPage } from "./pages/SessionPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { hrefFor, useRoute, type Route } from "./route.js";
import { useLoad } from "./use-load.js";
import type { VoiceIO } from "./voice/io.js";

interface PageProps {
  readonly api: ApiClient;
  readonly voice: VoiceIO | undefined;
  readonly route: Route;
}

function Page({ api, voice, route }: PageProps): JSX.Element {
  switch (route.page) {
    case "home":
      return <HomePage api={api} />;
    case "history":
      return <HistoryPage api={api} />;
    case "setup":
      return <SetupPage key={route.interviewId} api={api} voice={voice} interviewId={route.interviewId} />;
    case "session":
      return <SessionPage key={route.sessionId} api={api} voice={voice} sessionId={route.sessionId} />;
  }
}

/** The nav entry that should look selected: setup belongs to Interviews, sessions to neither. */
function current(route: Route, page: "home" | "history"): "page" | undefined {
  const section = route.page === "setup" ? "home" : route.page;
  return section === page ? "page" : undefined;
}

interface AppProps {
  readonly api: ApiClient;
  /** Builds the browser's audio once the server has said which speech services it has. */
  readonly createVoice: (info: VoiceInfo) => VoiceIO;
}

export function App({ api, createVoice }: AppProps): JSX.Element {
  const route = useRoute();
  const info = useLoad("info", api.info);
  const ready = info.current.state === "ready" ? info.current.value : undefined;
  const voiceInfo = ready?.voice;
  const voice = useMemo(() => (voiceInfo === undefined ? undefined : createVoice(voiceInfo)), [createVoice, voiceInfo]);
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href={hrefFor({ page: "home" })}>
            <span className="brand-mark">
              <Icon name="logo" size={20} />
            </span>
            <span className="brand-name">
              CrackYour<span>AI</span>Interview
            </span>
          </a>
          <nav className="nav" aria-label="Main">
            <a href={hrefFor({ page: "home" })} aria-current={current(route, "home")}>
              Interviews
            </a>
            <a href={hrefFor({ page: "history" })} aria-current={current(route, "history")}>
              History
            </a>
          </nav>
          {ready === undefined ? null : (
            <span className="pill model-chip" title={`Interviewer model: ${ready.model}`}>
              <span className="live-dot" />
              <span>{ready.model}</span>
            </span>
          )}
        </div>
      </header>
      <main className="content" key={hrefFor(route)}>
        <Page api={api} voice={voice} route={route} />
      </main>
      <footer className="footer">
        <span>{ready === undefined ? "cyai" : `cyai ${ready.version}`} · Practice only. Never use it during a real interview.</span>
        <span>Runs on your computer</span>
      </footer>
    </div>
  );
}
