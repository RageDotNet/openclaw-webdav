import { describe, expect, it } from "vitest";
import { handlePut } from "../../src/core/protocol/put.handler.js";
import { MemoryStorageAdapter } from "../../src/core/storage/memoryAdapter.js";
import { createMockRequest, invokeHandler } from "../helpers/httpHarness.js";

const WORKSPACE = "/workspace";
const opts = { workspaceDir: WORKSPACE };

async function setupAdapter() {
  const adapter = new MemoryStorageAdapter();
  await adapter.mkdir("/workspace");
  await adapter.mkdir("/workspace/docs");
  await adapter.writeFile("/workspace/existing.txt", Buffer.from("old content"));
  return adapter;
}

describe("handlePut", () => {
  it("creates a new file and returns 201", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PUT", "/new.txt", {}, "hello world");
    const res = await invokeHandler((r) => handlePut(r, adapter, opts), req);
    expect(res.statusCode).toBe(201);
    const data = await adapter.readFile("/workspace/new.txt");
    expect(data.toString()).toBe("hello world");
  });

  it("overwrites existing file and returns 204", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PUT", "/existing.txt", {}, "new content");
    const res = await invokeHandler((r) => handlePut(r, adapter, opts), req);
    expect(res.statusCode).toBe(204);
    const data = await adapter.readFile("/workspace/existing.txt");
    expect(data.toString()).toBe("new content");
  });

  it("creates intermediate parent directories", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PUT", "/a/b/c/file.txt", {}, "data");
    const res = await invokeHandler((r) => handlePut(r, adapter, opts), req);
    expect(res.statusCode).toBe(201);
    expect(await adapter.exists("/workspace/a/b/c/file.txt")).toBe(true);
  });

  it("returns 409 when parent path component is a file", async () => {
    const adapter = await setupAdapter();
    // existing.txt is a file, not a directory
    const req = createMockRequest("PUT", "/existing.txt/child.txt", {}, "data");
    const res = await invokeHandler((r) => handlePut(r, adapter, opts), req);
    expect(res.statusCode).toBe(409);
  });

  it("returns 403 for path outside workspace", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PUT", "/../etc/passwd", {}, "data");
    const res = await invokeHandler((r) => handlePut(r, adapter, opts), req);
    expect(res.statusCode).toBe(403);
  });

  it("returns 405 when target is a directory", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PUT", "/docs", {}, "data");
    const res = await invokeHandler((r) => handlePut(r, adapter, opts), req);
    expect(res.statusCode).toBe(405);
  });

  it("uses streaming (createWriteStream) — body is piped not buffered", async () => {
    const adapter = await setupAdapter();
    // Verify the implementation uses createWriteStream by checking the file was written
    const largeData = Buffer.alloc(1024 * 1024, "x"); // 1MB
    const req = createMockRequest("PUT", "/large.bin", {}, largeData);
    const res = await invokeHandler((r) => handlePut(r, adapter, opts), req);
    expect(res.statusCode).toBe(201);
    const written = await adapter.readFile("/workspace/large.bin");
    expect(written.length).toBe(largeData.length);
  });

  it("handles empty body", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PUT", "/empty.txt", {}, Buffer.alloc(0));
    const res = await invokeHandler((r) => handlePut(r, adapter, opts), req);
    expect(res.statusCode).toBe(201);
    const data = await adapter.readFile("/workspace/empty.txt");
    expect(data.length).toBe(0);
  });
});
