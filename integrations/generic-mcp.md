# Any MCP client

Register a **stdio** server named `cyai`:

| Field | Value |
|---|---|
| command | `node` |
| args | `["/absolute/path/to/cyai/packages/cli/dist/bin.js", "mcp"]` |
| env (optional) | `CYAI_HOME`, `CYAI_TEMPLATES` |

Most clients accept this JSON shape:

```json
{
  "mcpServers": {
    "cyai": {
      "command": "node",
      "args": ["/absolute/path/to/cyai/packages/cli/dist/bin.js", "mcp"]
    }
  }
}
```

## What the agent gets

**Prompt** `mock_interview` (optional `interviewId`) starts a practice session.

**Tools**

| Tool | Purpose |
|---|---|
| `list_interviews` | Installed interviews |
| `start_interview` | Start a session (optional resume and job description) |
| `provide_question` | Hand in a question the agent wrote from cyai's brief |
| `submit_answer` | Record the candidate's answer |
| `submit_evaluation` | Hand in the agent's rubric evaluation of that answer |
| `resume_interview` | Pick up a saved session |
| `abandon_interview` | Stop a session |
| `list_sessions` | Past and in-progress sessions |

Every tool result says what to call next. The agent writes questions and evaluations with prompts that cyai supplies, and cyai enforces the turn policy, the time limits and the scoring. A client that follows tool results gets the same interview as the terminal CLI.
