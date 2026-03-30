import { describe, expect, it } from "vitest";
import { handleMove } from "../../src/core/protocol/move.handler.js";
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
  await adapter.mkdir("/workspace/destparent");
  await adapter.writeFile("/workspace/existing.txt", Buffer.from("existing"));
  return adapter;
}

function dest(path: string) {
  return `http://${SERVER_HOST}${path}`;
}

describe("handleMove", () => {
  it("renames a file and returns 201", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MOVE", "/file.txt", { destination: dest("/renamed.txt") });
    const res = await invokeHandler((r) => handleMove(r, adapter, opts), req);
    expect(res.statusCode).toBe(201);
    expect(await adapter.exists("/workspace/renamed.txt")).toBe(true);
    expect(await adapter.exists("/workspace/file.txt")).toBe(false);
    const data = await adapter.readFile("/workspace/renamed.txt");
    expect(data.toString()).toBe("original");
  });

  it("moves a directory and returns 201", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MOVE", "/srcdir", { destination: dest("/destdir") });
    const res = await invokeHandler((r) => handleMove(r, adapter, opts), req);
    expect(res.statusCode).toBe(201);
    expect(await adapter.exists("/workspace/destdir/a.txt")).toBe(true);
    expect(await adapter.exists("/workspace/srcdir")).toBe(false);
  });

  it("returns 204 when overwriting existing destination", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MOVE", "/file.txt", {
      destination: dest("/existing.txt"),
      overwrite: "T",
    });
    const res = await invokeHandler((r) => handleMove(r, adapter, opts), req);
    expect(res.statusCode).toBe(204);
    expect(await adapter.exists("/workspace/file.txt")).toBe(false);
  });

  it("returns 412 when Overwrite:F and destination exists", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MOVE", "/file.txt", {
      destination: dest("/existing.txt"),
      overwrite: "F",
    });
    const res = await invokeHandler((r) => handleMove(r, adapter, opts), req);
    expect(res.statusCode).toBe(412);
    expect(await adapter.exists("/workspace/file.txt")).toBe(true);
  });

  it("returns 400 if Destination header is missing", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MOVE", "/file.txt");
    const res = await invokeHandler((r) => handleMove(r, adapter, opts), req);
    expect(res.statusCode).toBe(400);
  });

  it("returns 502 for cross-server destination", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MOVE", "/file.txt", {
      destination: "http://other-server.com/file.txt",
    });
    const res = await invokeHandler((r) => handleMove(r, adapter, opts), req);
    expect(res.statusCode).toBe(502);
  });

  it("returns 404 for non-existent source", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MOVE", "/missing.txt", { destination: dest("/dest.txt") });
    const res = await invokeHandler((r) => handleMove(r, adapter, opts), req);
    expect(res.statusCode).toBe(404);
  });

  it("returns 403 for source path outside workspace", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MOVE", "/../etc/passwd", { destination: dest("/dest.txt") });
    const res = await invokeHandler((r) => handleMove(r, adapter, opts), req);
    expect(res.statusCode).toBe(403);
  });

  it("cross-directory move works", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("MOVE", "/file.txt", {
      destination: dest("/destparent/file.txt"),
    });
    const res = await invokeHandler((r) => handleMove(r, adapter, opts), req);
    expect(res.statusCode).toBe(201);
    expect(await adapter.exists("/workspace/destparent/file.txt")).toBe(true);
    expect(await adapter.exists("/workspace/file.txt")).toBe(false);
  });
});
