// @ts-check
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * Modules that perform I/O. Packages listed in `pureGlobs` may not import them,
 * which keeps the engine runnable in any runtime (Node, browser, worker).
 */
const IO_MODULES = [
  "node:*",
  "fs",
  "fs/*",
  "path",
  "child_process",
  "http",
  "https",
  "net",
  "os",
];

/**
 * @typedef {object} CyaiEslintOptions
 * @property {string} tsconfigRootDir Absolute path of the repository root.
 * @property {readonly string[]} [pureGlobs] File globs that must stay free of I/O imports.
 */

/**
 * Builds the shared strict configuration.
 * @param {CyaiEslintOptions} options
 */
export function createConfig({ tsconfigRootDir, pureGlobs = [] }) {
  return defineConfig(
    { ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"] },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-non-null-assertion": "error",
        "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
        "@typescript-eslint/ban-ts-comment": [
          "error",
          { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true, "ts-check": false },
        ],
        "@typescript-eslint/explicit-module-boundary-types": "error",
        "@typescript-eslint/explicit-function-return-type": "error",
        "@typescript-eslint/consistent-type-imports": "error",
        "@typescript-eslint/consistent-type-exports": "error",
        "@typescript-eslint/no-import-type-side-effects": "error",
        "@typescript-eslint/strict-boolean-expressions": "error",
        "@typescript-eslint/switch-exhaustiveness-check": [
          "error",
          { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: true },
        ],
        "@typescript-eslint/prefer-readonly": "error",
        "@typescript-eslint/no-shadow": "error",
        "@typescript-eslint/default-param-last": "error",
        "@typescript-eslint/method-signature-style": ["error", "property"],
        eqeqeq: ["error", "always"],
        "no-console": "error",
        "no-param-reassign": "error",
        "prefer-const": "error",
        "no-shadow": "off",
      },
    },
    {
      files: ["**/*.js", "**/*.mjs"],
      extends: [tseslint.configs.disableTypeChecked],
      rules: {
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
      },
    },
    {
      files: [...pureGlobs],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: IO_MODULES,
                message: "Pure packages must not perform I/O. Inject a port instead.",
              },
            ],
          },
        ],
      },
    },
  );
}
