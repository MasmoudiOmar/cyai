import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createApiClient } from "./api.js";
import { App } from "./App.js";
import "./styles.css";

const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <App api={createApiClient()} />
    </StrictMode>,
  );
}
