import { describe, expect, it } from "vitest";
import { handleGet } from "../../src/core/protocol/get.handler.js";
import { handleHead } from "../../src/core/protocol/head.handler.js";
import { MemoryStorageAdapter } from "../../src/core/storage/memoryAdapter.js";
import { createMockRequest, invokeHandler } from "../helpers/httpHarness.js";

const WORKSPACE = "/workspace";
const opts = { workspaceDir: WORKSPACE };

async function setupAdapter() {
  const adapter = new MemoryStorageAdapter();
  await adapter.mkdir("/workspace");
  await adapter.writeFile("/workspace/file.txt", Buffer.from("hello world"));
  await adapter.mkdir("/workspace/docs");
  return adapter;
}

describe("handleHead", () => {
  it("returns 200 for existing file", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("HEAD", "/file.txt");
    const res = await invokeHandler((r) => handleHead(r, adapter, opts), req);
    expect(res.statusCode).toBe(200);
  });

  it("returns empty body", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("HEAD", "/file.txt");
    const res = await invokeHandler((r) => handleHead(r, adapter, opts), req);
    expect(res.body.length).toBe(0);
  });

  it("returns same headers as GET (Content-Type, Content-Length, Last-Modified, ETag)", async () => {
    const adapter = await setupAdapter();
    const getReq = createMockRequest("GET", "/file.txt");
    const headReq = createMockRequest("HEAD", "/file.txt");

    const getRes = await invokeHandler((r) => handleGet(r, adapter, opts), getReq);
    const headRes = await invokeHandler((r) => handleHead(r, adapter, opts), headReq);

    expect(headRes.headers["content-type"]).toBe(getRes.headers["content-type"]);
    expect(headRes.headers["content-length"]).toBe(getRes.headers["content-length"]);
    expect(headRes.headers["last-modified"]).toBe(getRes.headers["last-modified"]);
    expect(headRes.headers["etag"]).toBe(getRes.headers["etag"]);
  });

  it("returns 404 for non-existent file", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("HEAD", "/missing.txt");
    const res = await invokeHandler((r) => handleHead(r, adapter, opts), req);
    expect(res.statusCode).toBe(404);
  });

  it("returns 405 for directory", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("HEAD", "/docs");
    const res = await invokeHandler((r) => handleHead(r, adapter, opts), req);
    expect(res.statusCode).toBe(405);
  });

  it("returns 403 for path outside workspace", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("HEAD", "/../etc/passwd");
    const res = await invokeHandler((r) => handleHead(r, adapter, opts), req);
    expect(res.statusCode).toBe(403);
  });
});
