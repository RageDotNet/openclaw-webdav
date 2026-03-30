import { describe, expect, it } from "vitest";
import { handleDelete } from "../../src/core/protocol/delete.handler.js";
import { MemoryStorageAdapter } from "../../src/core/storage/memoryAdapter.js";
import { createMockRequest, invokeHandler } from "../helpers/httpHarness.js";

const WORKSPACE = "/workspace";
const opts = { workspaceDir: WORKSPACE };

async function setupAdapter() {
  const adapter = new MemoryStorageAdapter();
  await adapter.mkdir("/workspace");
  await adapter.writeFile("/workspace/file.txt", Buffer.from("hello"));
  await adapter.mkdir("/workspace/emptydir");
  await adapter.mkdir("/workspace/nonempty");
  await adapter.writeFile("/workspace/nonempty/child.txt", Buffer.from("x"));
  await adapter.mkdir("/workspace/deep");
  await adapter.mkdir("/workspace/deep/sub");
  await adapter.writeFile("/workspace/deep/sub/file.txt", Buffer.from("deep"));
  return adapter;
}

describe("handleDelete", () => {
  it("deletes a file and returns 204", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("DELETE", "/file.txt");
    const res = await invokeHandler((r) => handleDelete(r, adapter, opts), req);
    expect(res.statusCode).toBe(204);
    expect(await adapter.exists("/workspace/file.txt")).toBe(false);
  });

  it("returns 404 for non-existent resource", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("DELETE", "/missing.txt");
    const res = await invokeHandler((r) => handleDelete(r, adapter, opts), req);
    expect(res.statusCode).toBe(404);
  });

  it("deletes empty directory with Depth:infinity", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("DELETE", "/emptydir", { depth: "infinity" });
    const res = await invokeHandler((r) => handleDelete(r, adapter, opts), req);
    expect(res.statusCode).toBe(204);
    expect(await adapter.exists("/workspace/emptydir")).toBe(false);
  });

  it("Depth:0 on non-empty collection returns 409", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("DELETE", "/nonempty", { depth: "0" });
    const res = await invokeHandler((r) => handleDelete(r, adapter, opts), req);
    expect(res.statusCode).toBe(409);
    expect(await adapter.exists("/workspace/nonempty")).toBe(true);
  });

  it("Depth:infinity recursively deletes non-empty directory", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("DELETE", "/nonempty", { depth: "infinity" });
    const res = await invokeHandler((r) => handleDelete(r, adapter, opts), req);
    expect(res.statusCode).toBe(204);
    expect(await adapter.exists("/workspace/nonempty")).toBe(false);
  });

  it("Depth:infinity recursively deletes deeply nested directory", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("DELETE", "/deep", { depth: "infinity" });
    const res = await invokeHandler((r) => handleDelete(r, adapter, opts), req);
    expect(res.statusCode).toBe(204);
    expect(await adapter.exists("/workspace/deep")).toBe(false);
    expect(await adapter.exists("/workspace/deep/sub")).toBe(false);
    expect(await adapter.exists("/workspace/deep/sub/file.txt")).toBe(false);
  });

  it("default depth is infinity (no Depth header)", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("DELETE", "/nonempty");
    const res = await invokeHandler((r) => handleDelete(r, adapter, opts), req);
    expect(res.statusCode).toBe(204);
    expect(await adapter.exists("/workspace/nonempty")).toBe(false);
  });

  it("files are deleted regardless of Depth header", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("DELETE", "/file.txt", { depth: "0" });
    const res = await invokeHandler((r) => handleDelete(r, adapter, opts), req);
    expect(res.statusCode).toBe(204);
    expect(await adapter.exists("/workspace/file.txt")).toBe(false);
  });

  it("returns 403 for path outside workspace", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("DELETE", "/../etc/passwd");
    const res = await invokeHandler((r) => handleDelete(r, adapter, opts), req);
    expect(res.statusCode).toBe(403);
  });
});
