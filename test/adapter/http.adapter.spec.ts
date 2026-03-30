import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { parseOpenClawRequest, sendHandlerResult } from "../../src/adapter/http.js";
import type { OpenClawRequest, OpenClawResponse } from "../../src/adapter/http.js";
import type { HandlerResult } from "../../src/types.js";

// ─── Mock Helpers ─────────────────────────────────────────────────────────────

function createMockReq(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: Buffer | string,
): OpenClawRequest {
  const bodyBuffer =
    body === undefined
      ? Buffer.alloc(0)
      : typeof body === "string"
        ? Buffer.from(body, "utf-8")
        : body;

  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  const req: OpenClawRequest = {
    method,
    url,
    headers,
    on(event: string, listener: (...args: unknown[]) => void) {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(listener);
      return req as OpenClawRequest;
    },
  };

  // Emit events asynchronously
  setImmediate(() => {
    if (bodyBuffer.length > 0) {
      listeners["data"]?.forEach((l) => l(bodyBuffer));
    }
    listeners["end"]?.forEach((l) => l());
  });

  return req;
}

interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string | string[] | number>;
  body: Buffer;
}

function createMockRes(): { res: OpenClawResponse; capture: () => CapturedResponse } {
  let statusCode = 200;
  const headers: Record<string, string | string[] | number> = {};
  const chunks: Buffer[] = [];

  const res: OpenClawResponse = {
    writeHead(code, hdrs) {
      statusCode = code;
      if (hdrs) Object.assign(headers, hdrs);
    },
    write(chunk) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    },
    end(chunk?) {
      if (chunk !== undefined) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
    },
  };

  return {
    res,
    capture: () => ({ statusCode, headers, body: Buffer.concat(chunks) }),
  };
}

// ─── parseOpenClawRequest ─────────────────────────────────────────────────────

describe("parseOpenClawRequest", () => {
  it("parses method, path, and headers", async () => {
    const req = createMockReq("GET", "/webdav/file.txt", { "Content-Type": "text/plain" });
    const parsed = await parseOpenClawRequest(req);

    expect(parsed.method).toBe("GET");
    expect(parsed.path).toBe("/webdav/file.txt");
    expect(parsed.headers["content-type"]).toBe("text/plain");
  });

  it("reads body into Buffer", async () => {
    const req = createMockReq("PUT", "/webdav/file.txt", {}, "hello world");
    const parsed = await parseOpenClawRequest(req);

    expect(parsed.body).toBeInstanceOf(Buffer);
    expect((parsed.body as Buffer).toString("utf-8")).toBe("hello world");
  });

  it("parses query parameters", async () => {
    const req = createMockReq("GET", "/webdav/file.txt?foo=bar&baz=qux");
    const parsed = await parseOpenClawRequest(req);

    expect(parsed.path).toBe("/webdav/file.txt");
    expect(parsed.query).toEqual({ foo: "bar", baz: "qux" });
  });

  it("normalizes header names to lowercase", async () => {
    const req = createMockReq("GET", "/", { "X-Custom-Header": "value", "DAV": "1, 2" });
    const parsed = await parseOpenClawRequest(req);

    expect(parsed.headers["x-custom-header"]).toBe("value");
    expect(parsed.headers["dav"]).toBe("1, 2");
  });

  it("defaults method to GET when missing", async () => {
    const req = createMockReq("", "/");
    (req as { method?: string }).method = undefined;
    const parsed = await parseOpenClawRequest(req);

    expect(parsed.method).toBe("GET");
  });

  it("defaults path to / when url is missing", async () => {
    const req = createMockReq("GET", "/");
    (req as { url?: string }).url = undefined;
    const parsed = await parseOpenClawRequest(req);

    expect(parsed.path).toBe("/");
  });

  it("returns empty body buffer when no body", async () => {
    const req = createMockReq("GET", "/");
    const parsed = await parseOpenClawRequest(req);

    expect(parsed.body).toBeInstanceOf(Buffer);
    expect((parsed.body as Buffer).length).toBe(0);
  });
});

// ─── sendHandlerResult ────────────────────────────────────────────────────────

describe("sendHandlerResult", () => {
  it("writes status and headers", async () => {
    const { res, capture } = createMockRes();
    const result: HandlerResult = {
      status: 200,
      headers: { "Content-Type": "text/plain", "Content-Length": 5 },
      body: Buffer.from("hello"),
    };

    await sendHandlerResult(res, result);
    const captured = capture();

    expect(captured.statusCode).toBe(200);
    expect(captured.headers["Content-Type"]).toBe("text/plain");
    expect(captured.body.toString()).toBe("hello");
  });

  it("handles undefined body", async () => {
    const { res, capture } = createMockRes();
    const result: HandlerResult = { status: 204, headers: {}, body: undefined };

    await sendHandlerResult(res, result);
    const captured = capture();

    expect(captured.statusCode).toBe(204);
    expect(captured.body.length).toBe(0);
  });

  it("handles string body", async () => {
    const { res, capture } = createMockRes();
    const result: HandlerResult = { status: 200, headers: {}, body: "hello" };

    await sendHandlerResult(res, result);
    const captured = capture();

    expect(captured.body.toString("utf-8")).toBe("hello");
  });

  it("handles Buffer body", async () => {
    const { res, capture } = createMockRes();
    const result: HandlerResult = {
      status: 200,
      headers: {},
      body: Buffer.from([0x01, 0x02, 0x03]),
    };

    await sendHandlerResult(res, result);
    const captured = capture();

    expect(captured.body).toEqual(Buffer.from([0x01, 0x02, 0x03]));
  });

  it("streams Readable body", async () => {
    const { res, capture } = createMockRes();
    const readable = Readable.from(["chunk1", "chunk2"]);
    const result: HandlerResult = { status: 200, headers: {}, body: readable };

    await sendHandlerResult(res, result);
    const captured = capture();

    expect(captured.body.toString("utf-8")).toBe("chunk1chunk2");
  });

  it("handles null body same as undefined", async () => {
    const { res, capture } = createMockRes();
    const result: HandlerResult = { status: 404, headers: {}, body: null as unknown as undefined };

    await sendHandlerResult(res, result);
    const captured = capture();

    expect(captured.statusCode).toBe(404);
    expect(captured.body.length).toBe(0);
  });
});
