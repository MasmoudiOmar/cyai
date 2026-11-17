import type { ModelError } from "@cyai/core";
import { errorMessage } from "@cyai/node";
import { err, ok, type Result } from "@cyai/spec";

import { failureForStatus, modelError } from "./failures.js";

/** Connection settings shared by every OpenAI-compatible endpoint. */
export interface EndpointOptions {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly fetch?: typeof globalThis.fetch;
}

/** POSTs to `path` under the endpoint's base URL; connection failures and error statuses become model errors. */
export async function postTo(
  options: EndpointOptions,
  path: string,
  init: { readonly headers?: Readonly<Record<string, string>>; readonly body: string | FormData },
): Promise<Result<Response, ModelError>> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = { ...init.headers };
  if (options.apiKey !== undefined) {
    headers["authorization"] = `Bearer ${options.apiKey}`;
  }
  let response: Response;
  try {
    response = await fetchImpl(`${options.baseUrl.replace(/\/+$/, "")}${path}`, { method: "POST", headers, body: init.body });
  } catch (error) {
    return err(modelError("unavailable", errorMessage(error)));
  }
  return response.ok
    ? ok(response)
    : err(modelError(failureForStatus(response.status), `${String(response.status)} ${await response.text()}`));
}

/** Reads a response body; a connection dropped mid-body is reported as unavailable. */
export async function readBody<T>(read: () => Promise<T>): Promise<Result<T, ModelError>> {
  try {
    return ok(await read());
  } catch (error) {
    return err(modelError("unavailable", errorMessage(error)));
  }
}
