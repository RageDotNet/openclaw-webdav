import { describe, expect, it } from "vitest";
import { handleCopy } from "../../src/core/protocol/copy.handler.js";
import { MemoryStorageAdapter } from "../../src/core/storage/memoryAdapter.js";
import { createMockRequest, invokeHandler } from "../helpers/httpHarness.js";

const WORKSPACE = "/workspace";
const SERVER_HOST = "localhost:8080";
const opts = { workspaceDir: WORKSPACE, serverHost: SERVER_HOST };

async function setupAdapter() {
  const adapter = new MemoryStorageAdapter();
  await adapter.mkdir("/workspace");
  await adapter.writeFile("/workspace/file.txt", Buffer.from("original"));
  await adapter.mkdir("/workspace/srcdir");
  await adapter.writeFile("/workspace/srcdir/a.txt", Buffer.from("a"));
  await adapter.mkdir("/workspace/srcdir/sub");
  await adapter.writeFile("/workspace/srcdir/sub/b.txt", Buffer.from("b"));
  await adapter.writeFile("/workspace/existing.txt", Buffer.from("existing"));
  return adapter;
}

function dest(path: string) {
  return `http://${SERVER_HOST}${path}`;
}

describe("handleCopy", () => {
  it("copies a file and returns 201", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("COPY", "/file.txt", { destination: dest("/copy.txt") });
    const res = await invokeHandler((r) => handleCopy(r, adapter, opts), req);
    expect(res.statusCode).toBe(201);
    expect(await adapter.exists("/workspace/copy.txt")).toBe(true);
    expect(await adapter.exists("/workspace/file.txt")).toBe(true);
    const data = await adapter.readFile("/workspace/copy.txt");
    expect(data.toString()).toBe("original");
  });

  it("copies a directory recursively and returns 201", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("COPY", "/srcdir", { destination: dest("/destdir") });
    const res = await invokeHandler((r) => handleCopy(r, adapter, opts), req);
    expect(res.statusCode).toBe(201);
    expect(await adapter.exists("/workspace/destdir/a.txt")).toBe(true);
    expect(await adapter.exists("/workspace/destdir/sub/b.txt")).toBe(true);
  });

  it("returns 204 when overwriting existing destination", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("COPY", "/file.txt", {
      destination: dest("/existing.txt"),
      overwrite: "T",
    });
    const res = await invokeHandler((r) => handleCopy(r, adapter, opts), req);
    expect(res.statusCode).toBe(204);
  });

  it("returns 412 when Overwrite:F and destination exists", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("COPY", "/file.txt", {
      destination: dest("/existing.txt"),
      overwrite: "F",
    });
    const res = await invokeHandler((r) => handleCopy(r, adapter, opts), req);
    expect(res.statusCode).toBe(412);
  });

  it("returns 400 if Destination header is missing", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("COPY", "/file.txt");
    const res = await invokeHandler((r) => handleCopy(r, adapter, opts), req);
    expect(res.statusCode).toBe(400);
  });

  it("returns 502 for cross-server destination", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("COPY", "/file.txt", {
      destination: "http://other-server.com/file.txt",
    });
    const res = await invokeHandler((r) => handleCopy(r, adapter, opts), req);
    expect(res.statusCode).toBe(502);
  });

  it("returns 404 for non-existent source", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("COPY", "/missing.txt", { destination: dest("/copy.txt") });
    const res = await invokeHandler((r) => handleCopy(r, adapter, opts), req);
    expect(res.statusCode).toBe(404);
  });

  it("returns 403 for source path outside workspace", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("COPY", "/../etc/passwd", { destination: dest("/copy.txt") });
    const res = await invokeHandler((r) => handleCopy(r, adapter, opts), req);
    expect(res.statusCode).toBe(403);
  });
});
