import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { unwrap, unwrapErr } from "@cyai/fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ApiRequest, ApiResponse } from "./api.js";
import {
  boundPort,
  DEFAULT_HOST,
  isLocalHost,
  MAX_BODY_BYTES,
  requestTarget,
  serverUrl,
  startWebServer,
  staticPath,
  type RunningServer,
} from "./http.js";

interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

interface Send {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

let root: string;
let server: RunningServer;
let port: number;
const calls: ApiRequest[] = [];

function send(path: string, { method = "GET", headers = {}, body }: Send = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: "127.0.0.1", port, path, method, headers: { host: `localhost:${String(port)}`, ...headers } }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

const api = (request: ApiRequest): Promise<ApiResponse> => {
  calls.push(request);
  return request.path === "/boom" ? Promise.reject(new Error("exploded")) : Promise.resolve({ status: 200, body: { echo: request.body } });
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cyai-web-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<!doctype html><title>cyai</title>");
  await writeFile(join(root, "assets", "app.js"), "console.log(1)");
  await writeFile(join(root, "assets", "blob.bin"), "x");
  server = unwrap(await startWebServer({ api, staticDir: root, port: 0 }));
  port = Number(new URL(server.url).port);
});

afterAll(async () => {
  await server.close();
  await rm(root, { recursive: true, force: true });
});

const JSON_POST = { method: "POST", headers: { "content-type": "application/json" } } as const;

describe("web server", () => {
  it("serves the app shell, assets and client-side routes with security headers", async () => {
    const shell = await send("/");
    expect(shell.status).toBe(200);
    expect(shell.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(shell.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(shell.headers["x-content-type-options"]).toBe("nosniff");
    expect(shell.body).toContain("<title>cyai</title>");
    expect(await send("/assets/app.js")).toMatchObject({ status: 200, headers: { "content-type": "text/javascript; charset=utf-8" } });
    expect(await send("/assets/blob.bin")).toMatchObject({ status: 200, headers: { "content-type": "application/octet-stream" } });
    expect(await send("/practice/x")).toMatchObject({ status: 200, body: "<!doctype html><title>cyai</title>" });
    expect(await send("/assets")).toMatchObject({ status: 200, body: "<!doctype html><title>cyai</title>" });
    expect(await send("/missing.js")).toMatchObject({ status: 404 });
    expect(await send("/", { method: "PUT" })).toMatchObject({ status: 405 });
  });

  it("reports unreadable files as server errors", async () => {
    const locked = join(root, "assets", "locked.js");
    await writeFile(locked, "secret");
    await chmod(locked, 0o000);
    expect(await send("/assets/locked.js")).toMatchObject({ status: 500 });
  });

  it("refuses paths that escape the web root", async () => {
    expect(await send("/..%2F..%2Fetc%2Fpasswd")).toMatchObject({ status: 400 });
    expect(await send("/%E0%A4%A")).toMatchObject({ status: 400 });
  });

  it("only answers requests addressed to localhost", async () => {
    expect(await send("/", { headers: { host: "evil.example:80" } })).toMatchObject({ status: 403 });
  });

  it("forwards API calls with their JSON body", async () => {
    expect(await send("/api/info")).toMatchObject({ status: 200, body: "{}" });
    const posted = await send("/api/sessions", { ...JSON_POST, body: '{"interviewId":"x"}' });
    expect(posted).toMatchObject({ status: 200, body: '{"echo":{"interviewId":"x"}}', headers: { "cache-control": "no-store" } });
    expect(calls.at(-1)).toEqual({ method: "POST", path: "/sessions", body: { interviewId: "x" } });
    const local = { ...JSON_POST.headers, origin: `http://localhost:${String(port)}` };
    expect(await send("/api/sessions", { method: "POST", headers: local, body: "{}" })).toMatchObject({ status: 200 });
  });

  it("rejects unsafe or malformed API requests", async () => {
    expect(await send("/api/sessions", { method: "POST", body: "{}" })).toMatchObject({ status: 415 });
    expect(await send("/api/sessions", { ...JSON_POST, body: "{" })).toMatchObject({ status: 400 });
    const evil = { ...JSON_POST.headers, origin: "https://evil.example" };
    expect(await send("/api/sessions", { method: "POST", headers: evil, body: "{}" })).toMatchObject({ status: 403 });
    const garbled = { ...JSON_POST.headers, origin: "not a url" };
    expect(await send("/api/sessions", { method: "POST", headers: garbled, body: "{}" })).toMatchObject({ status: 403 });
    const huge = "x".repeat(MAX_BODY_BYTES + 1);
    expect(await send("/api/sessions", { ...JSON_POST, body: `"${huge}"` })).toMatchObject({ status: 413 });
  });

  it("turns unexpected failures into a 500", async () => {
    expect(await send("/api/boom")).toMatchObject({ status: 500, body: '{"error":"exploded"}' });
  });

  it("reports a port that is already taken", async () => {
    const taken = unwrapErr(await startWebServer({ api, staticDir: root, port, host: DEFAULT_HOST }));
    expect(taken).toContain(`Cannot listen on 127.0.0.1:${String(port)}:`);
  });
});

describe("helpers", () => {
  it.each([
    [undefined, false],
    ["localhost:4477", true],
    ["LOCALHOST", true],
    ["127.0.0.1:1", true],
    ["[::1]:4477", true],
    ["localhost.evil.example", false],
    ["evil.example", false],
  ])("isLocalHost(%j) is %s", (header, expected) => {
    expect(isLocalHost(header)).toBe(expected);
  });

  it("keeps static paths inside the root", () => {
    expect(staticPath("/srv/web", "/")).toBe("/srv/web/");
    expect(staticPath("/srv/web", "/a/b.js")).toBe("/srv/web/a/b.js");
    expect(staticPath("/srv/web", "/../web2/x")).toBeUndefined();
  });

  it("defaults a request target", () => {
    expect(requestTarget({})).toEqual({ path: "/", method: "GET" });
    expect(requestTarget({ url: "/api/x?y=1", method: "POST" })).toEqual({ path: "/api/x", method: "POST" });
  });

  it("reports the bound port and a friendly URL", () => {
    expect(boundPort({ address: "127.0.0.1", family: "IPv4", port: 5000 }, 1)).toBe(5000);
    expect(boundPort("/tmp/pipe", 1)).toBe(1);
    expect(boundPort(null, 1)).toBe(1);
    expect(serverUrl(DEFAULT_HOST, 4477)).toBe("http://localhost:4477");
    expect(serverUrl("0.0.0.0", 80)).toBe("http://0.0.0.0:80");
  });
});
