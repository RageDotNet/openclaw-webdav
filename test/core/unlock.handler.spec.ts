import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleLock } from "../../src/core/protocol/lock.handler.js";
import { handleUnlock } from "../../src/core/protocol/unlock.handler.js";
import { InMemoryLockManager } from "../../src/core/locks/lockManager.js";
import { createMockRequest, invokeHandler } from "../helpers/httpHarness.js";

const WORKSPACE = "/workspace";
const opts = { workspaceDir: WORKSPACE };

const LOCKINFO = `<?xml version="1.0" encoding="utf-8"?>
<D:lockinfo xmlns:D="DAV:">
  <D:lockscope><D:exclusive/></D:lockscope>
  <D:locktype><D:write/></D:locktype>
</D:lockinfo>`;

async function acquireLock(manager: InMemoryLockManager, path = "/file.txt"): Promise<string> {
  const req = createMockRequest("LOCK", path, {}, LOCKINFO);
  const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
  return res.headers["lock-token"] as string;
}

describe("handleUnlock", () => {
  let manager: InMemoryLockManager;

  beforeEach(() => {
    manager = new InMemoryLockManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it("successfully unlocks a locked resource and returns 204", async () => {
    const lockToken = await acquireLock(manager);
    const req = createMockRequest("UNLOCK", "/file.txt", { "lock-token": lockToken });
    const res = await invokeHandler((r) => handleUnlock(r, manager, opts), req);
    expect(res.statusCode).toBe(204);
    expect(await manager.isLocked("/workspace/file.txt")).toBe(false);
  });

  it("returns 400 if Lock-Token header is missing", async () => {
    const req = createMockRequest("UNLOCK", "/file.txt");
    const res = await invokeHandler((r) => handleUnlock(r, manager, opts), req);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 if Lock-Token header is not in <opaquelocktoken:...> format", async () => {
    const req = createMockRequest("UNLOCK", "/file.txt", { "lock-token": "bad-token" });
    const res = await invokeHandler((r) => handleUnlock(r, manager, opts), req);
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 if token does not match any lock for the resource", async () => {
    await acquireLock(manager);
    const req = createMockRequest("UNLOCK", "/file.txt", {
      "lock-token": "<opaquelocktoken:00000000-0000-0000-0000-000000000000>",
    });
    const res = await invokeHandler((r) => handleUnlock(r, manager, opts), req);
    expect(res.statusCode).toBe(409);
  });

  it("returns 409 if token belongs to a different path", async () => {
    const lockToken = await acquireLock(manager, "/file.txt");
    const req = createMockRequest("UNLOCK", "/other.txt", { "lock-token": lockToken });
    const res = await invokeHandler((r) => handleUnlock(r, manager, opts), req);
    expect(res.statusCode).toBe(409);
  });

  it("returns 403 for path outside workspace", async () => {
    const lockToken = await acquireLock(manager);
    const req = createMockRequest("UNLOCK", "/../etc/passwd", { "lock-token": lockToken });
    const res = await invokeHandler((r) => handleUnlock(r, manager, opts), req);
    expect(res.statusCode).toBe(403);
  });
});
