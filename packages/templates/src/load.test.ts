import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveInterview } from "@cyai/core";
import { unwrap } from "@cyai/fixtures";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { describeLoadError, loadCatalog, readTemplateDirectory } from "./load.js";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cyai-templates-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(relative: string, content: string): Promise<void> {
  const file = join(root, relative);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, content);
}

describe("built-in templates", () => {
  it("are schema-valid and every interview resolves to its profile and rubric", async () => {
    const catalog = unwrap(await loadCatalog());
    expect([...catalog.interviews.keys()].sort()).toEqual([
      "ai-trainer-generalist",
      "expert-voice-screen",
      "graduate-program-behavioral",
      "software-engineer-screen",
    ]);
    for (const id of catalog.interviews.keys()) {
      expect(resolveInterview(catalog, id, {}).ok).toBe(true);
    }
  });
});

describe("readTemplateDirectory", () => {
  it("treats missing kind folders as empty and ignores non-YAML files", async () => {
    await put("rubrics/README.md", "# notes");
    expect(unwrap(await readTemplateDirectory(root))).toEqual({ profiles: [], rubrics: [], interviews: [] });
  });

  it("reports malformed YAML with the file path", async () => {
    await put("profiles/broken.yaml", "id: [unclosed");
    const result = await readTemplateDirectory(root);
    expect(result).toMatchObject({ ok: false, error: { code: "template_load_error", file: join(root, "profiles/broken.yaml") } });
  });

  it("reports schema violations with the failing path", async () => {
    await put("rubrics/bad.yml", "id: Not-Kebab\nversion: 1\nname: Bad\npassThreshold: 3\ncriteria: []\n");
    const result = await readTemplateDirectory(root);
    expect(result.ok ? "" : result.error.message).toContain("id: Must be a kebab-case identifier");
  });

  it.each([
    ["profiles", "profiles/bad.yaml"],
    ["interviews", "interviews/bad.yaml"],
  ])("stops at the first invalid %s file", async (_kind, file) => {
    await put(file, "id: x\n");
    expect((await readTemplateDirectory(root)).ok).toBe(false);
  });

  it("reports folders that cannot be read", async () => {
    await put("profiles", "not a directory");
    expect(await readTemplateDirectory(root)).toMatchObject({ ok: false, error: { file: join(root, "profiles") } });
  });
});

describe("loadCatalog", () => {
  it("rejects extra folders that redefine a built-in id", async () => {
    await put("rubrics/dup.yaml", "id: behavioral-star\nversion: 2\nname: Dup\npassThreshold: 3\ncriteria:\n  - id: only\n    label: Only\n    weight: 1\n    levels: [{ score: 1, description: Low }, { score: 5, description: High }]\n");
    expect(await loadCatalog({ directories: [root] })).toMatchObject({
      ok: false,
      error: { code: "duplicate_template", kind: "rubric", id: "behavioral-star" },
    });
  });

  it("can load only the given folders", async () => {
    expect(unwrap(await loadCatalog({ directories: [root], includeBuiltins: false })).interviews.size).toBe(0);
  });

  it("propagates load errors from any folder", async () => {
    await put("interviews/bad.yaml", "id: x\n");
    expect((await loadCatalog({ directories: [root] })).ok).toBe(false);
  });
});

describe("describeLoadError", () => {
  it("names the file for load errors and defers to the engine for catalog errors", () => {
    expect(describeLoadError({ code: "template_load_error", file: "/t/x.yaml", message: "bad" })).toBe("/t/x.yaml: bad");
    expect(describeLoadError({ code: "duplicate_template", kind: "rubric", id: "x" })).toBe(
      'Two rubric templates share the id "x".',
    );
  });
});
