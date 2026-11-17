import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCatalog, describeError, type CatalogError, type TemplateCatalog, type TemplateDocuments } from "@cyai/core";
import { errorMessage, isMissingPath } from "@cyai/node";
import {
  describeIssues,
  err,
  interviewerProfileSchema,
  interviewSpecSchema,
  ok,
  rubricSchema,
  type Result,
} from "@cyai/spec";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";

/** Templates shipped with this package. */
export const BUILTIN_TEMPLATES_DIR = fileURLToPath(new URL("../templates", import.meta.url));

export interface TemplateLoadError {
  readonly code: "template_load_error";
  readonly file: string;
  readonly message: string;
}

export type LoadCatalogError = TemplateLoadError | CatalogError;

/** One-line explanation of a template loading problem. */
export function describeLoadError(error: LoadCatalogError): string {
  return error.code === "template_load_error" ? `${error.file}: ${error.message}` : describeError(error);
}

type Kind = keyof TemplateDocuments;

const KINDS: readonly Kind[] = ["profiles", "rubrics", "interviews"];

/** Mutable collection of documents by kind, filled folder by folder. */
type Collected = { [K in Kind]: TemplateDocuments[K][number][] };

const SCHEMAS: { readonly [K in Kind]: z.ZodType<TemplateDocuments[K][number]> } = {
  profiles: interviewerProfileSchema,
  rubrics: rubricSchema,
  interviews: interviewSpecSchema,
};

const YAML_FILE = /\.ya?ml$/;

function loadError(file: string, message: string): TemplateLoadError {
  return { code: "template_load_error", file, message };
}

async function readOne<T>(file: string, schema: z.ZodType<T>): Promise<Result<T, TemplateLoadError>> {
  try {
    const raw: unknown = parseYaml(await readFile(file, "utf8"));
    const parsed = schema.safeParse(raw);
    return parsed.success ? ok(parsed.data) : err(loadError(file, describeIssues(parsed.error)));
  } catch (error) {
    return err(loadError(file, errorMessage(error)));
  }
}

/** Adds every YAML document of one kind under `root` to `into`. Returns the first error, if any. */
async function collectKind<K extends Kind>(
  root: string,
  kind: K,
  into: Pick<Collected, K>,
): Promise<TemplateLoadError | undefined> {
  const directory = join(root, kind);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    return isMissingPath(error) ? undefined : loadError(directory, errorMessage(error));
  }
  for (const name of names.filter((entry) => YAML_FILE.test(entry)).sort()) {
    const document = await readOne(join(directory, name), SCHEMAS[kind]);
    if (!document.ok) {
      return document.error;
    }
    into[kind].push(document.value);
  }
  return undefined;
}

async function collectDirectory(root: string, into: Collected): Promise<TemplateLoadError | undefined> {
  for (const kind of KINDS) {
    const failure = await collectKind(root, kind, into);
    if (failure !== undefined) {
      return failure;
    }
  }
  return undefined;
}

function emptyCollection(): Collected {
  return { profiles: [], rubrics: [], interviews: [] };
}

/** Reads `profiles/`, `rubrics/` and `interviews/` YAML files under `root`. Missing folders are empty. */
export async function readTemplateDirectory(root: string): Promise<Result<TemplateDocuments, TemplateLoadError>> {
  const collected = emptyCollection();
  const failure = await collectDirectory(root, collected);
  return failure === undefined ? ok(collected) : err(failure);
}

export interface LoadCatalogOptions {
  /** Extra template folders, merged after the built-ins. Ids must stay unique. */
  readonly directories?: readonly string[];
  /** Set to false to load only `directories`. */
  readonly includeBuiltins?: boolean;
}

/** Loads and indexes templates from the built-in folder and any extra folders. */
export async function loadCatalog(options: LoadCatalogOptions = {}): Promise<Result<TemplateCatalog, LoadCatalogError>> {
  const roots = [...(options.includeBuiltins === false ? [] : [BUILTIN_TEMPLATES_DIR]), ...(options.directories ?? [])];
  const collected = emptyCollection();
  for (const root of roots) {
    const failure = await collectDirectory(root, collected);
    if (failure !== undefined) {
      return err(failure);
    }
  }
  return buildCatalog(collected);
}
