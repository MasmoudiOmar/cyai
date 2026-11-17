// @ts-check
import { createConfig } from "@cyai/eslint-config";

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  pureGlobs: ["packages/spec/src/**/*.ts", "packages/core/src/**/*.ts", "packages/web/src/**/*.{ts,tsx}"],
  reactGlobs: ["packages/web/src/**/*.{ts,tsx}"],
});
