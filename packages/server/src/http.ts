import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, sep } from "node:path";

import { errorMessage, isMissingPath } from "@cyai/node";
import { err, ok, type ErrorBody, type Result } from "@cyai/spec";

import type { ApiRequest, ApiResponse } from "./api.js";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4477;
/** Resumes are pasted as text; anything bigger than this is not a practice request. */
export const MAX_BODY_BYTES = 1024 * 1024;
/** A three-minute answer in compressed audio is a few megabytes; Whisper servers accept up to 25 MB. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Recordings the browser may upload for transcription. */
export const AUDIO_TYPES: ReadonlySet<string> = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"]);

const API_PREFIX = "/api";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const HTML = "text/html; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": HTML,
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": JSON_TYPE,
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export interface WebServerOptions {
  readonly api: (request: ApiRequest) => Promise<ApiResponse>;
  /** Folder holding the built web client (`index.html` and its assets). */
  readonly staticDir: string;
}

export interface ListenOptions {
  readonly host?: string;
  /** `0` picks a free port. */
  readonly port: number;
}

export interface RunningServer {
  readonly url: string;
  readonly close: () => Promise<void>;
}

type Handler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

function send(response: ServerResponse, status: number, type: string, body: string | Buffer): void {
  response.writeHead(status, { ...SECURITY_HEADERS, "content-type": type, "cache-control": "no-store" });
  response.end(body);
}

function sendJson(response: ServerResponse, { status, body }: ApiResponse): void {
  send(response, status, JSON_TYPE, JSON.stringify(body));
}

function sendApi(response: ServerResponse, api: ApiResponse): void {
  if (api.audio === undefined) {
    sendJson(response, api);
    return;
  }
  send(response, api.status, api.audio.type, Buffer.from(api.audio.bytes));
}

function sendError(response: ServerResponse, status: number, error: string): void {
  const body: ErrorBody = { error };
  sendJson(response, { status, body });
}

/** True for requests addressed to this machine. Blocks DNS-rebinding pages from reaching the API. */
export function isLocalHost(header: string | undefined): boolean {
  if (header === undefined) {
    return false;
  }
  // Drop a trailing port; an IPv6 literal keeps its brackets, e.g. "[::1]:4477" -> "[::1]".
  return LOCAL_HOSTNAMES.has(header.replace(/:\d*$/, "").toLowerCase());
}

function isLocalOrigin(origin: string | undefined): boolean {
  if (origin === undefined) {
    return true;
  }
  try {
    return isLocalHost(new URL(origin).host);
  } catch {
    return false;
  }
}

/** Collects the body; an oversized one is drained and rejected so the 413 still reaches the client. */
function readBody(request: IncomingMessage, limit: number): Promise<Result<Buffer, ApiResponse>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      chunks.push(chunk);
      if (size > limit) {
        chunks.length = 0;
      }
    });
    request.on("end", () => {
      resolve(size > limit ? err({ status: 413, body: { error: "The request is too large." } }) : ok(Buffer.concat(chunks)));
    });
  });
}

type RequestBody = Pick<ApiRequest, "body" | "audio">;

function mediaType(request: IncomingMessage): string | undefined {
  return request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
}

/** A POST body: an audio recording when one is sent, JSON otherwise. */
async function readRequestBody(request: IncomingMessage): Promise<Result<RequestBody, ApiResponse>> {
  if (request.method !== "POST") {
    return ok({ body: undefined });
  }
  const type = mediaType(request);
  if (type !== undefined && AUDIO_TYPES.has(type)) {
    const bytes = await readBody(request, MAX_AUDIO_BYTES);
    return bytes.ok ? ok({ body: undefined, audio: { bytes: new Uint8Array(bytes.value), type } }) : bytes;
  }
  if (type !== "application/json") {
    return err({ status: 415, body: { error: "Send JSON with Content-Type: application/json." } });
  }
  const text = await readBody(request, MAX_BODY_BYTES);
  if (!text.ok) {
    return text;
  }
  try {
    const body: unknown = JSON.parse(text.value.toString("utf8"));
    return ok({ body });
  } catch {
    return err({ status: 400, body: { error: "The request body is not valid JSON." } });
  }
}

/** Resolves a URL path inside `root`, or `undefined` when it would escape it. */
export function staticPath(root: string, urlPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return undefined;
  }
  const resolved = normalize(join(root, decoded));
  return resolved === normalize(root) || resolved.startsWith(normalize(root) + sep) ? resolved : undefined;
}

async function readStatic(file: string): Promise<Buffer | undefined> {
  try {
    return (await stat(file)).isFile() ? await readFile(file) : undefined;
  } catch (error) {
    if (isMissingPath(error)) {
      return undefined;
    }
    throw error;
  }
}

async function serveStatic(root: string, urlPath: string, response: ServerResponse): Promise<void> {
  const file = staticPath(root, urlPath);
  if (file === undefined) {
    sendError(response, 400, "Bad path.");
    return;
  }
  const body = await readStatic(file);
  if (body !== undefined) {
    send(response, 200, CONTENT_TYPES[extname(file)] ?? "application/octet-stream", body);
    return;
  }
  // Client-side routes have no extension: serve the app shell. Missing assets are real 404s.
  const shell = extname(file) === "" ? await readStatic(join(root, "index.html")) : undefined;
  if (shell === undefined) {
    sendError(response, 404, "Not found.");
    return;
  }
  send(response, 200, HTML, shell);
}

/** The path and method of a request. Node always sets both on server requests; the defaults satisfy the types. */
export function requestTarget(request: Pick<IncomingMessage, "url" | "method">): { readonly path: string; readonly method: string } {
  return { path: new URL(request.url ?? "/", "http://localhost").pathname, method: request.method ?? "GET" };
}

/** Handles one HTTP request: `/api/*` goes to the practice API, everything else is the web client. */
export function createRequestHandler(options: WebServerOptions): Handler {
  return async (request, response) => {
    try {
      if (!isLocalHost(request.headers.host)) {
        sendError(response, 403, "cyai only answers requests for localhost.");
        return;
      }
      const { path, method } = requestTarget(request);
      if (path === API_PREFIX || path.startsWith(`${API_PREFIX}/`)) {
        if (method === "POST" && !isLocalOrigin(request.headers.origin)) {
          sendError(response, 403, "Cross-origin requests are not allowed.");
          return;
        }
        const body = await readRequestBody(request);
        sendApi(response, body.ok ? await options.api({ method, path: path.slice(API_PREFIX.length), ...body.value }) : body.error);
        return;
      }
      if (method !== "GET" && method !== "HEAD") {
        sendError(response, 405, "Method not allowed.");
        return;
      }
      await serveStatic(options.staticDir, path, response);
    } catch (error) {
      sendError(response, 500, errorMessage(error));
    }
  };
}

/** The port a listening server is bound to; `fallback` for pipe or unbound addresses. */
export function boundPort(address: AddressInfo | string | null, fallback: number): number {
  return typeof address === "object" && address !== null ? address.port : fallback;
}

/** How the server is addressed in links: `localhost` reads better than the loopback IP. */
export function serverUrl(host: string, port: number): string {
  return `http://${host === DEFAULT_HOST ? "localhost" : host}:${String(port)}`;
}

/** Starts listening and resolves once the server accepts connections. */
export function startWebServer(options: WebServerOptions & ListenOptions): Promise<Result<RunningServer, string>> {
  const handler = createRequestHandler(options);
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  const host = options.host ?? DEFAULT_HOST;
  const close = (): Promise<void> =>
    new Promise((done) => {
      server.closeAllConnections();
      server.close(() => {
        done();
      });
    });
  return new Promise((resolve) => {
    server.once("error", (error) => {
      resolve(err(`Cannot listen on ${host}:${String(options.port)}: ${error.message}`));
    });
    server.listen(options.port, host, () => {
      resolve(ok({ url: serverUrl(host, boundPort(server.address(), options.port)), close }));
    });
  });
}
