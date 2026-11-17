import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["@cyai/source"] },
  ssr: { resolve: { conditions: ["@cyai/source"] } },
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts", "**/test-support/**", "packages/fixtures/**", "**/bin.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
