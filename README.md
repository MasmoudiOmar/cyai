# cyai: CrackYourAIInterview engine

Practice for interviews run by **AI interviewers** (async video screens, adaptive voice/chat screeners), locally and with any AI agent you already use.

> **Status:** M1. The web app, the terminal CLI, the MCP server, the model adapters and the starter templates work. It is not on npm yet: build it from source.

## Quick start

```bash
pnpm install && pnpm build
alias cyai="node $PWD/packages/cli/dist/bin.js"
```

Then pick the interface that suits you:

| You prefer | Run | What you get |
|---|---|---|
| A browser | `cyai ui` | A local web app at http://localhost:4477: pick an interview, paste your resume, answer out loud or in writing as the real screen expects, read a scored debrief |
| A terminal | `cyai practice ai-trainer-generalist --resume cv.md --jd job.md` | The same interview, question by question, in the terminal |
| Your AI agent | `cyai mcp` (see below) | Claude Code, Cursor or Codex runs the interview |

`cyai ui` and `cyai practice` need an interviewer model: set `ANTHROPIC_API_KEY` to use Claude, or add `--provider openai --model llama3.2` to use a local [Ollama](https://ollama.com) model for free. Everything stays on your computer except what is sent to that model. The web app listens on localhost only.

To use cyai from your agent, in Claude Code run:

```bash
claude mcp add --scope user cyai -- node "$PWD/packages/cli/dist/bin.js" mcp
```

Guides for Claude Code, Cursor, Codex and other MCP clients are in [integrations/](integrations).

## Spoken interviews

Voice screeners such as Mercor's and micro1's are spoken, and so are cyai's interviews that copy them (marked **Spoken** in the app):

- The interviewer asks each question out loud. Captions are off by default, as in the real thing.
- You answer out loud. A conversational interviewer moves on after a 4-second pause, and checks in if you say nothing for 10 seconds. A one-way recorded screen records until its window closes or you click Done.
- Follow-ups build on what you just said.
- The debrief scores your delivery as well as your content: pace, filler words ("um", "uh", "you know"), long pauses and how quickly you start. Fillers are highlighted in each transcript.

The browser asks for your microphone once; the setup page checks it before you start. By default the browser does the speech work (best in Chrome or Edge), but browser recognisers send audio to their vendor and drop many fillers. For verbatim transcripts and a better voice, point cyai at OpenAI-compatible speech servers:

```bash
# Local servers, e.g. speaches (Whisper + Kokoro); check its docs for model and voice names
cyai ui --stt-url http://localhost:8000/v1 --stt-model Systran/faster-whisper-small \
        --tts-url http://localhost:8000/v1 --tts-model <kokoro-model> --tts-voice af_heart

# Or OpenAI (audio leaves your computer): uses OPENAI_API_KEY, whisper-1 and tts-1 by default
cyai ui --stt-url https://api.openai.com/v1 --tts-url https://api.openai.com/v1
```

`CYAI_SPEECH_API_KEY` overrides `OPENAI_API_KEY` for speech servers. Recordings are never stored: sessions keep the transcript and the delivery measurements only. In the terminal, spoken interviews are typed.

## How it works

- **Agent mode (`cyai mcp`).** Your agent is the interviewer. cyai hands it the plan, the question briefs, the rubric and the follow-up policy, then scores what it reports. No API key is needed beyond the one your agent already uses.
- **Web and terminal modes (`cyai ui`, `cyai practice`).** A model plays the interviewer: Claude by default, or any OpenAI-compatible server such as Ollama. Both use the same practice service and session store, so sessions from either show up in the web app's history, where unfinished ones can be continued.

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
| [`@cyai/server`](packages/server) | Local HTTP server: the JSON practice API and the built web app, localhost only |
| [`@cyai/web`](packages/web) | The React web app (Vite). Validates every API response against the `@cyai/spec` schemas |
| [`cyai`](packages/cli) | The command-line tool: `ui`, `list`, `practice`, `history`, `mcp` |
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
