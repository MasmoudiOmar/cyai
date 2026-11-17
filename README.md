# cyai: CrackYourAIInterview engine

Practice for interviews run by **AI interviewers** (async video screens, adaptive voice/chat screeners), locally and with any AI agent you already use.

> **Status:** M0, foundations. The spec and the pure engine exist. The MCP server and CLI come in M1.

## Packages

| Package | What it is |
|---|---|
| [`@cyai/spec`](packages/spec) | Zod schemas and the types derived from them: interviewer profiles, rubrics, interviews, sessions, scorecards |
| [`@cyai/core`](packages/core) | Pure, I/O-free engine: session state machine, turn policy (follow-ups, budgets), rubric scoring |
| `@cyai/tsconfig`, `@cyai/eslint-config` | Shared strict tooling configs |
| `@cyai/fixtures` | Private, schema-valid test fixtures (never published) |

## Engineering rules

These are enforced in CI, not just written down:

- TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- **No `any`, no type assertions (`as`), no non-null `!`, no `@ts-ignore`/`@ts-expect-error`** (typescript-eslint `strictTypeChecked`).
- **0% duplicated code** (jscpd).
- **100% test coverage** of `spec` and `core`.
- `spec` and `core` may not import Node or I/O modules. Side effects are injected through ports (`Clock`, `IdGenerator`, …).
- Expected failures are returned as typed `Result` values, never thrown.

```bash
pnpm install
pnpm check   # typecheck + lint + duplicate scan + tests with coverage + build
```

## Ethics

This is a **practice** tool. It will never assist during a real interview. See [ETHICS.md](ETHICS.md).

## License

**Source-available, not OSI open source.** [AGPL-3.0 with the Commons Clause](LICENSE):

- Free to use, study and modify, including for personal practice.
- Anyone who distributes a modified version, or runs one as a network service, must publish its source under the same terms.
- You may **not sell** the software or a product or service whose value comes substantially from it.

Contributions require signing the [CLA](CONTRIBUTING.md#contributor-license-agreement).
