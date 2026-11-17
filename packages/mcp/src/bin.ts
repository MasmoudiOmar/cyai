#!/usr/bin/env node
import { createFileSessionStore, defaultDataDir, systemClock, templateDirectories, uuidGenerator } from "@cyai/node";
import { describeLoadError, loadCatalog } from "@cyai/templates";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createCyaiServer } from "./server.js";
import { createInterviewService } from "./service.js";

const catalog = await loadCatalog({ directories: templateDirectories() });
if (!catalog.ok) {
  process.stderr.write(`cyai-mcp: ${describeLoadError(catalog.error)}\n`);
  process.exit(1);
}

const service = createInterviewService({
  catalog: catalog.value,
  store: createFileSessionStore(defaultDataDir()),
  clock: systemClock,
  ids: uuidGenerator,
});

await createCyaiServer(service).connect(new StdioServerTransport());
