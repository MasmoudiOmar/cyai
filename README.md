# cyai: CrackYourAIInterview engine

Practice for interviews run by **AI interviewers** (async video screens, adaptive voice/chat screeners), locally and with any AI agent you already use.

> **Status:** M1. The MCP server, the terminal CLI, the model adapters and the starter templates work. It is not on npm yet: build it from source.

## Quick start

```bash
pnpm install && pnpm build
node packages/cli/dist/bin.js list
node packages/cli/dist/bin.js practice ai-trainer-generalist --resume cv.md --jd job.md
```

Or plug it into your agent. In Claude Code, run:

```bash
claude mcp add --scope user cyai -- node "$PWD/packages/cli/dist/bin.js" mcp
```

Guides for Claude Code, Cursor, Codex and other MCP clients are in [integrations/](integrations).

## How it works

- **Agent mode (`cyai mcp`).** Your agent is the interviewer. cyai hands it the plan, the question briefs, the rubric and the follow-up policy, then scores what it reports. No API key is needed beyond the one your agent already uses.
- **Terminal mode (`cyai practice`).** A model plays the interviewer: Claude by default, or any OpenAI-compatible server such as Ollama.

Sessions are saved as JSON under `~/.cyai`, after every step, so an interrupted interview can be resumed.

## Packages

| Package | What it is |
|---|---|
| [`@cyai/spec`](packages/spec) | Zod schemas and the types derived from them: interviewer profiles, rubrics, interviews, sessions, scorecards |
| [`@cyai/core`](packages/core) | Pure, I/O-free engine: session state machine, turn policy (follow-ups, budgets), rubric scoring, interview flow |
| [`@cyai/templates`](packages/templates) | Built-in interviewer profiles, rubrics and interviews (YAML), and the catalog loader |
| [`@cyai/node`](packages/node) | Node adapters: JSON-file session store, system clock and ids, environment settings |
| [`@cyai/llm`](packages/llm) | `TextModel` adapters: Anthropic (Claude) and OpenAI-compatible (Ollama, vLLM, LM Studio, …) |
| [`@cyai/mcp`](packages/mcp) | The MCP server: interview tools and the `mock_interview` prompt |
| [`cyai`](packages/cli) | The command-line tool: `list`, `practice`, `history`, `mcp` |
| `@cyai/tsconfig`, `@cyai/eslint-config` | Shared strict tooling configs |
| `@cyai/fixtures` | Private, schema-valid test fixtures (never published) |

## Engineering rules

These are enforced in CI, not just written down:

- TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- **No `any`, no type assertions (`as`), no non-null `!`, no `@ts-ignore`/`@ts-expect-error`** (typescript-eslint `strictTypeChecked`).
- **0% duplicated code** (jscpd).
- **100% test coverage** of every package.
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
