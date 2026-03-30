import { describe, expect, it } from "vitest";
import { handleOptions } from "../../src/core/protocol/options.handler.js";
import { createMockRequest, invokeHandler } from "../helpers/httpHarness.js";

describe("handleOptions", () => {
  it("returns status 200", async () => {
    const req = createMockRequest("OPTIONS", "/");
    const res = await invokeHandler(handleOptions, req);
    expect(res.statusCode).toBe(200);
  });

  it("returns DAV: 1, 2 header", async () => {
    const req = createMockRequest("OPTIONS", "/");
    const res = await invokeHandler(handleOptions, req);
    expect(res.headers["dav"]).toBe("1, 2");
  });

  it("returns Allow header with all WebDAV methods", async () => {
    const req = createMockRequest("OPTIONS", "/");
    const res = await invokeHandler(handleOptions, req);
    const allow = res.headers["allow"] as string;
    expect(allow).toContain("OPTIONS");
    expect(allow).toContain("GET");
    expect(allow).toContain("HEAD");
    expect(allow).toContain("PUT");
    expect(allow).toContain("DELETE");
    expect(allow).toContain("MKCOL");
    expect(allow).toContain("COPY");
    expect(allow).toContain("MOVE");
    expect(allow).toContain("PROPFIND");
    expect(allow).toContain("LOCK");
    expect(allow).toContain("UNLOCK");
  });

  it("returns MS-Author-Via: DAV header (Windows WebDAV client)", async () => {
    const req = createMockRequest("OPTIONS", "/");
    const res = await invokeHandler(handleOptions, req);
    expect(res.headers["ms-author-via"]).toBe("DAV");
  });

  it("returns empty body", async () => {
    const req = createMockRequest("OPTIONS", "/");
    const res = await invokeHandler(handleOptions, req);
    expect(res.body.length).toBe(0);
  });
});
