import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["@cyai/source"] },
  ssr: { resolve: { conditions: ["@cyai/source"] } },
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/spec/src/**/*.ts", "packages/core/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts", "**/test-support/**"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
