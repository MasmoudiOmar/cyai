import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/** Unmounts rendered trees between tests (Vitest globals are off, so this is not automatic). */
afterEach(() => {
  cleanup();
  window.location.hash = "";
});
