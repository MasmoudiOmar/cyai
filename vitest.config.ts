import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["@cyai/source"] },
  ssr: { resolve: { conditions: ["@cyai/source"] } },
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/index.ts", "**/test-support/**", "packages/fixtures/**", "**/bin.ts", "packages/web/src/main.tsx"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
