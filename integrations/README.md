# Agent integrations

cyai speaks [MCP](https://modelcontextprotocol.io). Any MCP client can run a mock interview: the agent plays the interviewer and cyai supplies the interview plan, timing, follow-up policy, rubric and scoring.

| Client | Guide |
|---|---|
| Claude Code | [claude-code/](claude-code) (MCP server + `/practice-interview` skill) |
| Cursor | [cursor/](cursor) |
| Codex CLI | [codex/](codex) |
| Anything else | [generic-mcp.md](generic-mcp.md) |

## Install cyai first

cyai is not on npm yet. Build it from a clone:

```bash
git clone https://github.com/MasmoudiOmar/cyai.git
cd cyai
pnpm install
pnpm build
```

The server command used in every guide below is then:

```bash
node /absolute/path/to/cyai/packages/cli/dist/bin.js mcp
```

Replace `/absolute/path/to/cyai` with your clone. Sessions are saved under `~/.cyai` (`CYAI_HOME` overrides it). Extra template folders go in `CYAI_TEMPLATES`.

## No agent? Use the web app or the terminal

```bash
node packages/cli/dist/bin.js ui
```

```bash
node packages/cli/dist/bin.js practice ai-trainer-generalist --resume cv.md --jd job.md
```

`--provider anthropic` (the default) reads `ANTHROPIC_API_KEY`. `--provider openai --model <id>` talks to any OpenAI-compatible server, Ollama at `http://localhost:11434/v1` by default.
