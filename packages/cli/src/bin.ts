#!/usr/bin/env node
import { runCli } from "./main.js";
import { createStreamTerminal } from "./terminal.js";

const terminal = createStreamTerminal();
const exit = await runCli(process.argv.slice(2), { terminal, env: process.env });
if (exit !== "serving") {
  terminal.close();
  process.exitCode = exit;
}
