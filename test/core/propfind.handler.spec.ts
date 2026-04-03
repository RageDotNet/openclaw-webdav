import { describe, expect, it } from "vitest";
import { handlePropfind, handleProppatch } from "../../src/core/protocol/propfind.handler.js";
import { MemoryStorageAdapter } from "../../src/core/storage/memoryAdapter.js";
import { createMockRequest, invokeHandler } from "../helpers/httpHarness.js";

const WORKSPACE = "/workspace";
const opts = { workspaceDir: WORKSPACE };

async function setupAdapter() {
  const adapter = new MemoryStorageAdapter();
  await adapter.mkdir("/workspace");
  await adapter.writeFile("/workspace/file.txt", Buffer.from("hello world"));
  await adapter.mkdir("/workspace/docs");
  await adapter.writeFile("/workspace/docs/readme.md", Buffer.from("# Readme"));
  await adapter.mkdir("/workspace/docs/sub");
  await adapter.writeFile("/workspace/docs/sub/deep.txt", Buffer.from("deep"));
  return adapter;
}

// ─── WD-11: PROPFIND Depth:0 ─────────────────────────────────────────────────

describe("handlePropfind — Depth:0", () => {
  it("returns 207 Multi-Status for existing file", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/file.txt", { depth: "0" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    expect(res.statusCode).toBe(207);
  });

  it("returns Content-Type: application/xml", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/file.txt", { depth: "0" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    expect(res.headers["content-type"]).toContain("application/xml");
  });

  it("XML contains DAV: namespace", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/file.txt", { depth: "0" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    expect(res.body.toString()).toContain('xmlns:D="DAV:"');
  });

  it("XML contains D:multistatus root element", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/file.txt", { depth: "0" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    const xml = res.body.toString();
    expect(xml).toContain("<D:multistatus");
    expect(xml).toContain("</D:multistatus>");
  });

  it("XML contains required properties for file", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/file.txt", { depth: "0" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    const xml = res.body.toString();
    expect(xml).toContain("<D:creationdate>");
    expect(xml).toContain("<D:getcontentlength>");
    expect(xml).toContain("<D:getcontenttype>");
    expect(xml).toContain("<D:getetag>");
    expect(xml).toContain("<D:getlastmodified>");
    expect(xml).toContain("<D:resourcetype/>");
    expect(xml).toContain("<D:supportedlock>");
  });

  it("resourcetype is empty for files (not a collection)", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/file.txt", { depth: "0" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    const xml = res.body.toString();
    expect(xml).toContain("<D:resourcetype/>");
    expect(xml).not.toContain("<D:collection");
  });

  it("resourcetype contains D:collection for directories", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/docs", { depth: "0" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    const xml = res.body.toString();
    expect(xml).toContain("<D:collection/>");
  });

  it("returns 404 for non-existent resource", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/missing", { depth: "0" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    expect(res.statusCode).toBe(404);
  });

  it("returns 403 for path outside workspace", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/../etc", { depth: "0" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    expect(res.statusCode).toBe(403);
  });

  it("XML contains D:status HTTP/1.1 200 OK", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/file.txt", { depth: "0" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    expect(res.body.toString()).toContain("HTTP/1.1 200 OK");
  });

  it("XML contains D:href for the requested resource", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/file.txt", { depth: "0" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    expect(res.body.toString()).toContain("<D:href>/file.txt</D:href>");
  });

  it("Depth:0 on directory returns only the directory itself (1 response)", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/docs", { depth: "0" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    const xml = res.body.toString();
    const responseCount = (xml.match(/<D:response>/g) ?? []).length;
    expect(responseCount).toBe(1);
  });
});

// ─── WD-12: PROPFIND Depth:1 and infinity ────────────────────────────────────

describe("handlePropfind — Depth:1", () => {
  it("returns directory + immediate children", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/docs", { depth: "1" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    const xml = res.body.toString();
    // /docs itself + readme.md + sub/ = 3 responses
    const responseCount = (xml.match(/<D:response>/g) ?? []).length;
    expect(responseCount).toBe(3);
  });

  it("Depth:1 does not recurse into subdirectories", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/docs", { depth: "1" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    const xml = res.body.toString();
    expect(xml).not.toContain("deep.txt");
  });

  it("Depth:1 on file returns just the file", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/file.txt", { depth: "1" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    const xml = res.body.toString();
    const responseCount = (xml.match(/<D:response>/g) ?? []).length;
    expect(responseCount).toBe(1);
  });
});

describe("handlePropfind — routePrefix (gateway mount)", () => {
  it("prefixes D:href with routePrefix for root and children", async () => {
    const adapter = await setupAdapter();
    const prefixed = { workspaceDir: WORKSPACE, routePrefix: "/webdav" };
    const req = createMockRequest("PROPFIND", "/", { depth: "1" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, prefixed), req);
    const xml = res.body.toString();
    expect(xml).toContain("<D:href>/webdav/</D:href>");
    expect(xml).toContain("<D:href>/webdav/file.txt</D:href>");
  });

  it("prefixes nested collection hrefs", async () => {
    const adapter = await setupAdapter();
    const prefixed = { workspaceDir: WORKSPACE, routePrefix: "/plugins/dav" };
    const req = createMockRequest("PROPFIND", "/docs", { depth: "1" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, prefixed), req);
    const xml = res.body.toString();
    expect(xml).toContain("<D:href>/plugins/dav/docs/</D:href>");
    expect(xml).toContain("<D:href>/plugins/dav/docs/readme.md</D:href>");
    expect(xml).toContain("<D:href>/plugins/dav/docs/sub/</D:href>");
  });
});

describe("handlePropfind — Depth:infinity", () => {
  it("returns all descendants recursively", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/docs", { depth: "infinity" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    const xml = res.body.toString();
    // /docs + readme.md + sub/ + deep.txt = 4 responses
    const responseCount = (xml.match(/<D:response>/g) ?? []).length;
    expect(responseCount).toBe(4);
  });

  it("includes deep nested files", async () => {
    const adapter = await setupAdapter();
    const req = createMockRequest("PROPFIND", "/docs", { depth: "infinity" });
    const res = await invokeHandler((r) => handlePropfind(r, adapter, opts), req);
    expect(res.body.toString()).toContain("deep.txt");
  });

  it("returns 403 when depth limit exceeded", async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.mkdir("/workspace");
    // Create a deeply nested structure exceeding maxDepth=2
    await adapter.mkdir("/workspace/a");
    await adapter.mkdir("/workspace/a/b");
    await adapter.mkdir("/workspace/a/b/c");
    await adapter.writeFile("/workspace/a/b/c/file.txt", Buffer.from("x"));

    const req = createMockRequest("PROPFIND", "/", { depth: "infinity" });
    const res = await invokeHandler(
      (r) => handlePropfind(r, adapter, { workspaceDir: WORKSPACE, maxDepth: 2 }),
      req,
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.toString()).toContain("propfind-finite-depth");
  });
});

describe("handleProppatch", () => {
  it("returns 405 Method Not Allowed", async () => {
    const req = createMockRequest("PROPPATCH", "/file.txt");
    const res = await invokeHandler(handleProppatch, req);
    expect(res.statusCode).toBe(405);
  });
});
