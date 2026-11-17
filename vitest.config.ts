import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["@cyai/source"] },
  ssr: { resolve: { conditions: ["@cyai/source"] } },
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}"],
      // Entry points, plus the browser audio adapter: it only wires microphone, recorder and
      // speech APIs that jsdom lacks, and every decision it feeds is tested in voice/*.
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/index.ts",
        "**/test-support/**",
        "packages/fixtures/**",
        "**/bin.ts",
        "packages/web/src/main.tsx",
        "packages/web/src/voice/browser.ts",
      ],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
