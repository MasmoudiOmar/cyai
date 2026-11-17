import { createFileSessionStore, defaultDataDir, systemClock, templateDirectories, uuidGenerator } from "@cyai/node";
import { describeLoadError, loadCatalog } from "@cyai/templates";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { createCyaiServer } from "./server.js";
import { createInterviewService } from "./service.js";

/**
 * Serves cyai (over stdio by default) using the built-in templates, `$CYAI_TEMPLATES` and the session store in `$CYAI_HOME`.
 * Resolves once connected, or with an error message if templates cannot be loaded.
 */
export async function startStdioServer(
  env: NodeJS.ProcessEnv = process.env,
  transport: Transport = new StdioServerTransport(),
): Promise<string | undefined> {
  const catalog = await loadCatalog({ directories: templateDirectories(env) });
  if (!catalog.ok) {
    return describeLoadError(catalog.error);
  }
  const service = createInterviewService({
    catalog: catalog.value,
    store: createFileSessionStore(defaultDataDir(env)),
    clock: systemClock,
    ids: uuidGenerator,
  });
  await createCyaiServer(service).connect(transport);
  return undefined;
}
