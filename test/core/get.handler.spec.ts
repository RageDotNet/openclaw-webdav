import { describe, expect, it } from "vitest";
import { handleGet } from "../../src/core/protocol/get.handler.js";
import { MemoryStorageAdapter } from "../../src/core/storage/memoryAdapter.js";
import { createMockRequest, invokeHandler } from "../helpers/httpHarness.js";

const WORKSPACE = "/workspace";

function makeAdapter() {
  const adapter = new MemoryStorageAdapter();
  return adapter;
}

async function setupAdapter() {
  const adapter = makeAdapter();
  await adapter.mkdir("/workspace");
  await adapter.mkdir("/workspace/docs");
  await adapter.writeFile("/workspace/file.txt", Buffer.from("hello world"));
  await adapter.writeFile("/workspace/image.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return adapter;
}

const opts = { workspaceDir: WORKSPACE };

describe("handleGet", () => {
  it("returns 200 with file content", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("GET", "/file.txt");
    const res = await invokeHandler((r) => handleGet(r, adapter, opts), req);
    expect(res.statusCode).toBe(200);
    expect(res.body.toString()).toBe("hello world");
  });

  it("sets Content-Type from file extension", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("GET", "/file.txt");
    const res = await invokeHandler((r) => handleGet(r, adapter, opts), req);
    expect(res.headers["content-type"]).toContain("text/plain");
  });

  it("sets Content-Length header", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("GET", "/file.txt");
    const res = await invokeHandler((r) => handleGet(r, adapter, opts), req);
    expect(res.headers["content-length"]).toBe(11);
  });

  it("sets Last-Modified header", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("GET", "/file.txt");
    const res = await invokeHandler((r) => handleGet(r, adapter, opts), req);
    expect(res.headers["last-modified"]).toBeTruthy();
    expect(new Date(res.headers["last-modified"] as string).getTime()).toBeGreaterThan(0);
  });

  it("sets ETag header", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("GET", "/file.txt");
    const res = await invokeHandler((r) => handleGet(r, adapter, opts), req);
    expect(res.headers["etag"]).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
  });

  it("returns 404 for non-existent file", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("GET", "/missing.txt");
    const res = await invokeHandler((r) => handleGet(r, adapter, opts), req);
    expect(res.statusCode).toBe(404);
  });

  it("returns 200 with HTML directory listing for collection", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("GET", "/docs");
    const res = await invokeHandler((r) => handleGet(r, adapter, opts), req);
    expect(res.statusCode).toBe(200);
    expect(String(res.headers["content-type"])).toContain("text/html");
    const html = res.body.toString();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Index of /docs/");
    expect(html).toContain("<ul>");
    expect(html).toContain("</ul>");
    expect(html).toContain("Parent directory");
  });

  it("lists sorted entries as links with trailing slash for subdirs", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("GET", "/");
    const res = await invokeHandler((r) => handleGet(r, adapter, opts), req);
    expect(res.statusCode).toBe(200);
    const html = res.body.toString();
    expect(html).toContain('<a href="/docs/">docs/</a>');
    expect(html).toContain('<a href="/file.txt">file.txt</a>');
    expect(html).toContain('<a href="/image.png">image.png</a>');
    expect(html.indexOf("/docs/")).toBeLessThan(html.indexOf("/file.txt"));
  });

  it("prefixes hrefs with routePrefix when configured", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("GET", "/");
    const res = await invokeHandler((r) => handleGet(r, adapter, { ...opts, routePrefix: "/webdav" }), req);
    expect(res.statusCode).toBe(200);
    const html = res.body.toString();
    expect(html).toContain('<a href="/webdav/docs/">docs/</a>');
    expect(html).toContain('<a href="/webdav/file.txt">file.txt</a>');
    expect(html).toContain("Index of /webdav/");
  });

  it("returns 403 for path outside workspace", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("GET", "/../etc/passwd");
    const res = await invokeHandler((r) => handleGet(r, adapter, opts), req);
    expect(res.statusCode).toBe(403);
  });

  it("uses streaming (createReadStream) — not buffering", async () => {
    const adapter = await setupAdapter();
    // Verify the body is a Readable stream (not a Buffer) by checking the handler result directly
    const req = createMockRequest("GET", "/file.txt");
    const result = await handleGet(req, adapter, opts);
    // body should be a Readable stream, not a Buffer or string
    const { Readable } = await import("node:stream");
    expect(result.body).toBeInstanceOf(Readable);
  });

  it("sets correct Content-Type for PNG", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("GET", "/image.png");
    const res = await invokeHandler((r) => handleGet(r, adapter, opts), req);
    expect(res.headers["content-type"]).toContain("image/png");
  });

  it("returns application/octet-stream for unknown extension", async () => {
    const adapter = await setupAdapter();
    await adapter.writeFile("/workspace/file.unknownext12345", Buffer.from("data"));
    const req = createMockRequest("GET", "/file.unknownext12345");
    const res = await invokeHandler((r) => handleGet(r, adapter, opts), req);
    expect(res.headers["content-type"]).toContain("application/octet-stream");
  });
});
