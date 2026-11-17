#!/usr/bin/env node
import { startStdioServer } from "./stdio.js";

const failure = await startStdioServer();
if (failure !== undefined) {
  process.stderr.write(`cyai-mcp: ${failure}\n`);
  process.exitCode = 1;
}
