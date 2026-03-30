import { describe, expect, it } from "vitest";
import { handleMkcol } from "../../src/core/protocol/mkcol.handler.js";
import { MemoryStorageAdapter } from "../../src/core/storage/memoryAdapter.js";
import { createMockRequest, invokeHandler } from "../helpers/httpHarness.js";

const WORKSPACE = "/workspace";
const opts = { workspaceDir: WORKSPACE };

async function setupAdapter() {
  const adapter = new MemoryStorageAdapter();
  await adapter.mkdir("/workspace");
  await adapter.mkdir("/workspace/existing");
  await adapter.writeFile("/workspace/file.txt", Buffer.from("hello"));
  return adapter;
}

describe("handleMkcol", () => {
  it("creates a new collection and returns 201", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MKCOL", "/newdir");
    const res = await invokeHandler((r) => handleMkcol(r, adapter, opts), req);
    expect(res.statusCode).toBe(201);
    const stat = await adapter.stat("/workspace/newdir");
    expect(stat.isDirectory).toBe(true);
  });

  it("returns 405 if path already exists", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MKCOL", "/existing");
    const res = await invokeHandler((r) => handleMkcol(r, adapter, opts), req);
    expect(res.statusCode).toBe(405);
  });

  it("returns 409 if parent does not exist", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MKCOL", "/a/b/c");
    const res = await invokeHandler((r) => handleMkcol(r, adapter, opts), req);
    expect(res.statusCode).toBe(409);
  });

  it("returns 409 if parent is a file", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MKCOL", "/file.txt/newdir");
    const res = await invokeHandler((r) => handleMkcol(r, adapter, opts), req);
    expect(res.statusCode).toBe(409);
  });

  it("returns 415 if request body is non-empty", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MKCOL", "/newdir", {}, "some body");
    const res = await invokeHandler((r) => handleMkcol(r, adapter, opts), req);
    expect(res.statusCode).toBe(415);
  });

  it("returns 403 for path outside workspace", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MKCOL", "/../evil");
    const res = await invokeHandler((r) => handleMkcol(r, adapter, opts), req);
    expect(res.statusCode).toBe(403);
  });

  it("creates collection when parent exists", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MKCOL", "/existing/child");
    const res = await invokeHandler((r) => handleMkcol(r, adapter, opts), req);
    expect(res.statusCode).toBe(201);
    expect(await adapter.exists("/workspace/existing/child")).toBe(true);
  });
});
