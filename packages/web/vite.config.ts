import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

/** The API server `cyai ui` starts; `pnpm --filter @cyai/web dev` proxies to it. */
const API_SERVER = "http://localhost:4477";

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ["@cyai/source", ...defaultClientConditions] },
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/api": API_SERVER } },
});
