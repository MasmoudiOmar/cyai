# Claude Code

## 1. Add the MCP server

For yourself, in every project:

```bash
claude mcp add --scope user cyai -- node /absolute/path/to/cyai/packages/cli/dist/bin.js mcp
```

Or for one project, commit a `.mcp.json` like [mcp.json](mcp.json) at its root.

## 2. Add the skill (optional)

```bash
mkdir -p ~/.claude/skills
cp -r skills/practice-interview ~/.claude/skills/
```

## 3. Practise

Type `/practice-interview` (or `/practice-interview ai-trainer-generalist`), or just ask "give me a mock AI interview". The MCP prompt is also listed under `/mcp__cyai__mock_interview`.
