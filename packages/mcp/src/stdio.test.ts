import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startStdioServer } from "./stdio.js";
import { TOOLS } from "./tool-names.js";

let home = "";

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "cyai-mcp-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("startStdioServer", () => {
  it("serves the built-in interviews with the file store", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    expect(await startStdioServer({ CYAI_HOME: home }, serverTransport)).toBeUndefined();
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain(TOOLS.start);
  });

  it("returns a message instead of serving when templates are invalid", async () => {
    await mkdir(join(home, "profiles"), { recursive: true });
    await writeFile(join(home, "profiles", "bad.yaml"), "id: x\n");
    const message = await startStdioServer({ CYAI_HOME: home, CYAI_TEMPLATES: home });
    expect(message).toContain(join(home, "profiles", "bad.yaml"));
  });
});
