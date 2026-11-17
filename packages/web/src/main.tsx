import "@fontsource-variable/inter";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/jetbrains-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createApiClient } from "./api.js";
import { App } from "./App.js";
import "./styles.css";
import { createBrowserVoice } from "./voice/browser.js";

const root = document.getElementById("root");
if (root !== null) {
  const api = createApiClient();
  createRoot(root).render(
    <StrictMode>
      <App api={api} createVoice={(info) => createBrowserVoice(api, info)} />
    </StrictMode>,
  );
}
