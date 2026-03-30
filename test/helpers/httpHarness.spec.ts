import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { HandlerResult } from "../../src/types.js";
import {
  createMockRequest,
  createMockResponse,
  invokeHandler,
} from "./httpHarness.js";

describe("createMockRequest", () => {
  it("parses method, path, and headers", () => {
    const req = createMockRequest("GET", "/foo/bar", { "Content-Type": "text/plain" });
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/foo/bar");
    expect(req.headers["content-type"]).toBe("text/plain");
    expect(req.body).toEqual(Buffer.alloc(0));
  });

  it("parses query string from path", () => {
    const req = createMockRequest("GET", "/search?q=hello&page=2");
    expect(req.path).toBe("/search");
    expect(req.query["q"]).toBe("hello");
    expect(req.query["page"]).toBe("2");
  });

  it("accepts Buffer body", () => {
    const body = Buffer.from("hello world");
    const req = createMockRequest("PUT", "/file.txt", {}, body);
    expect(req.body).toEqual(body);
  });

  it("accepts string body and converts to Buffer", () => {
    const req = createMockRequest("PUT", "/file.txt", {}, "hello");
    expect(req.body).toEqual(Buffer.from("hello", "utf-8"));
  });

  it("normalizes header names to lowercase", () => {
    const req = createMockRequest("GET", "/", { "X-Custom-Header": "value" });
    expect(req.headers["x-custom-header"]).toBe("value");
  });
});

describe("createMockResponse", () => {
  it("captures status code from writeHead", () => {
    const res = createMockResponse();
    res.writeHead(404, { "content-type": "text/html" });
    const capture = res.getCapture();
    expect(capture.statusCode).toBe(404);
    expect(capture.headers["content-type"]).toBe("text/html");
  });

  it("captures body from write + end", () => {
    const res = createMockResponse();
    res.write(Buffer.from("hello "));
    res.end(Buffer.from("world"));
    const capture = res.getCapture();
    expect(capture.body.toString()).toBe("hello world");
  });

  it("captures setHeader calls", () => {
    const res = createMockResponse();
    res.setHeader("DAV", "1, 2");
    expect(res.getCapture().headers["dav"]).toBe("1, 2");
  });
});

describe("invokeHandler", () => {
  it("captures status, headers, and string body", async () => {
    const handler = (_req: Parameters<typeof invokeHandler>[1]): HandlerResult => ({
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    const req = createMockRequest("GET", "/");
    const capture = await invokeHandler(handler, req);
    expect(capture.statusCode).toBe(200);
    expect(capture.headers["content-type"]).toBe("text/plain");
    expect(capture.body.toString()).toBe("hello");
  });

  it("handles undefined body (204 no content)", async () => {
    const handler = (): HandlerResult => ({ status: 204, headers: {}, body: undefined });
    const req = createMockRequest("DELETE", "/file.txt");
    const capture = await invokeHandler(handler, req);
    expect(capture.statusCode).toBe(204);
    expect(capture.body.length).toBe(0);
  });

  it("handles null body", async () => {
    const handler = (): HandlerResult => ({ status: 204, headers: {}, body: null });
    const req = createMockRequest("DELETE", "/file.txt");
    const capture = await invokeHandler(handler, req);
    expect(capture.body.length).toBe(0);
  });

  it("handles Buffer body", async () => {
    const data = Buffer.from([0x01, 0x02, 0x03]);
    const handler = (): HandlerResult => ({
      status: 200,
      headers: { "content-type": "application/octet-stream" },
      body: data,
    });
    const req = createMockRequest("GET", "/binary");
    const capture = await invokeHandler(handler, req);
    expect(capture.body).toEqual(data);
  });

  it("handles Readable stream body", async () => {
    const handler = (): HandlerResult => ({
      status: 200,
      headers: {},
      body: Readable.from(["chunk1", "chunk2"]),
    });
    const req = createMockRequest("GET", "/stream");
    const capture = await invokeHandler(handler, req);
    expect(capture.body.toString()).toBe("chunk1chunk2");
  });

  it("handles async handler", async () => {
    const handler = async (): Promise<HandlerResult> => {
      await new Promise((r) => setTimeout(r, 1));
      return { status: 201, headers: {}, body: "created" };
    };
    const req = createMockRequest("POST", "/resource");
    const capture = await invokeHandler(handler, req);
    expect(capture.statusCode).toBe(201);
    expect(capture.body.toString()).toBe("created");
  });
});
