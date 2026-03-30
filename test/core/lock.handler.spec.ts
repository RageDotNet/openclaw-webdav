import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleLock } from "../../src/core/protocol/lock.handler.js";
import { InMemoryLockManager } from "../../src/core/locks/lockManager.js";
import { createMockRequest, invokeHandler } from "../helpers/httpHarness.js";

const WORKSPACE = "/workspace";
const opts = { workspaceDir: WORKSPACE };

const VALID_LOCKINFO = `<?xml version="1.0" encoding="utf-8"?>
<D:lockinfo xmlns:D="DAV:">
  <D:lockscope><D:exclusive/></D:lockscope>
  <D:locktype><D:write/></D:locktype>
  <D:owner><D:href>http://example.com/user</D:href></D:owner>
</D:lockinfo>`;

const SHARED_LOCKINFO = `<?xml version="1.0" encoding="utf-8"?>
<D:lockinfo xmlns:D="DAV:">
  <D:lockscope><D:shared/></D:lockscope>
  <D:locktype><D:write/></D:locktype>
</D:lockinfo>`;

describe("handleLock — WD-19: XML parsing and storage", () => {
  let manager: InMemoryLockManager;

  beforeEach(() => {
    manager = new InMemoryLockManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it("parses valid lockinfo and returns 200", async () => {
    const req = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.statusCode).toBe(200);
  });

  it("returns 400 for malformed XML", async () => {
    const req = createMockRequest("LOCK", "/file.txt", {}, "not xml at all <<<");
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for XML missing lockinfo element", async () => {
    const req = createMockRequest(
      "LOCK",
      "/file.txt",
      {},
      '<?xml version="1.0"?><root><something/></root>',
    );
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.statusCode).toBe(400);
  });

  it("stores the lock after successful LOCK request", async () => {
    const req = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(await manager.isLocked("/workspace/file.txt")).toBe(true);
  });

  it("returns 423 for duplicate exclusive lock", async () => {
    const req1 = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    await invokeHandler((r) => handleLock(r, manager, opts), req1);

    const req2 = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req2);
    expect(res.statusCode).toBe(423);
  });

  it("423 response includes lockdiscovery XML", async () => {
    const req1 = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    await invokeHandler((r) => handleLock(r, manager, opts), req1);

    const req2 = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req2);
    expect(res.body.toString()).toContain("D:activelock");
  });

  it("parses Timeout: Second-N header", async () => {
    const req = createMockRequest(
      "LOCK",
      "/file.txt",
      { timeout: "Second-7200" },
      VALID_LOCKINFO,
    );
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.statusCode).toBe(200);
    expect(res.body.toString()).toContain("Second-");
  });

  it("parses Timeout: Infinite header (uses 86400s)", async () => {
    const req = createMockRequest(
      "LOCK",
      "/file.txt",
      { timeout: "Infinite" },
      VALID_LOCKINFO,
    );
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.statusCode).toBe(200);
  });

  it("defaults to 3600s when no Timeout header", async () => {
    const req = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.statusCode).toBe(200);
  });
});

describe("handleLock — WD-20: response XML and headers", () => {
  let manager: InMemoryLockManager;

  beforeEach(() => {
    manager = new InMemoryLockManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it("returns Content-Type: application/xml", async () => {
    const req = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.headers["content-type"]).toContain("application/xml");
  });

  it("returns Lock-Token header in <opaquelocktoken:uuid> format", async () => {
    const req = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.headers["lock-token"]).toMatch(/^<opaquelocktoken:[0-9a-f-]{36}>$/);
  });

  it("response XML contains D:lockdiscovery", async () => {
    const req = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    const xml = res.body.toString();
    expect(xml).toContain("D:lockdiscovery");
    expect(xml).toContain("D:activelock");
  });

  it("response XML contains locktoken href", async () => {
    const req = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    const xml = res.body.toString();
    expect(xml).toContain("opaquelocktoken:");
  });

  it("response XML contains lockscope exclusive", async () => {
    const req = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.body.toString()).toContain("D:exclusive");
  });

  it("response XML contains lockscope shared for shared lock", async () => {
    const req = createMockRequest("LOCK", "/file.txt", {}, SHARED_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.body.toString()).toContain("D:shared");
  });

  it("Lock-Token header matches token in response XML", async () => {
    const req = createMockRequest("LOCK", "/file.txt", {}, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    const lockToken = (res.headers["lock-token"] as string).slice(1, -1); // strip < >
    expect(res.body.toString()).toContain(lockToken);
  });

  it("handles Depth:0", async () => {
    const req = createMockRequest("LOCK", "/file.txt", { depth: "0" }, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.statusCode).toBe(200);
    expect(res.body.toString()).toContain(">0<");
  });

  it("handles Depth:infinity", async () => {
    const req = createMockRequest("LOCK", "/docs", { depth: "infinity" }, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.statusCode).toBe(200);
    expect(res.body.toString()).toContain(">infinity<");
  });

  it("returns 403 for path outside workspace", async () => {
    const req = createMockRequest("LOCK", "/../etc", {}, VALID_LOCKINFO);
    const res = await invokeHandler((r) => handleLock(r, manager, opts), req);
    expect(res.statusCode).toBe(403);
  });
});
