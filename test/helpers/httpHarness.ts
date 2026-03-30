import { Readable } from "node:stream";
import type { HandlerResult, ParsedRequest } from "../../src/types.js";

// ─── Mock Request ─────────────────────────────────────────────────────────────

export function createMockRequest(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: Buffer | string,
): ParsedRequest {
  const bodyBuffer =
    body === undefined
      ? Buffer.alloc(0)
      : typeof body === "string"
        ? Buffer.from(body, "utf-8")
        : body;

  const query: Record<string, string> = {};
  const qIdx = path.indexOf("?");
  let cleanPath = path;
  if (qIdx !== -1) {
    cleanPath = path.slice(0, qIdx);
    const params = new URLSearchParams(path.slice(qIdx + 1));
    for (const [k, v] of params.entries()) {
      query[k] = v;
    }
  }

  return {
    method: method.toUpperCase(),
    path: cleanPath,
    query,
    headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    body: bodyBuffer,
  };
}

// ─── Mock Response ────────────────────────────────────────────────────────────

export interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string | string[] | number | undefined>;
  body: Buffer;
}

export interface MockResponse {
  statusCode: number;
  headers: Record<string, string | string[] | number | undefined>;
  chunks: Buffer[];
  setHeader(name: string, value: string | string[] | number): void;
  writeHead(statusCode: number, headers?: Record<string, string | string[] | number>): void;
  write(chunk: Buffer | string): void;
  end(chunk?: Buffer | string): void;
  getCapture(): CapturedResponse;
}

export function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    chunks: [],
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          this.headers[k.toLowerCase()] = v;
        }
      }
    },
    write(chunk) {
      this.chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf-8") : chunk);
    },
    end(chunk?) {
      if (chunk !== undefined) {
        this.chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf-8") : chunk);
      }
    },
    getCapture(): CapturedResponse {
      return {
        statusCode: this.statusCode,
        headers: { ...this.headers },
        body: Buffer.concat(this.chunks),
      };
    },
  };
  return res;
}

// ─── Handler Invocation ───────────────────────────────────────────────────────

type Handler = (req: ParsedRequest) => HandlerResult | Promise<HandlerResult>;

export async function invokeHandler(
  handler: Handler,
  req: ParsedRequest,
): Promise<CapturedResponse> {
  const result = await handler(req);
  const res = createMockResponse();

  res.writeHead(result.status, result.headers as Record<string, string | string[] | number>);

  if (result.body === undefined || result.body === null) {
    res.end();
  } else if (result.body instanceof Readable) {
    await new Promise<void>((resolve, reject) => {
      (result.body as Readable).on("data", (chunk: Buffer) => res.write(chunk));
      (result.body as Readable).on("end", () => {
        res.end();
        resolve();
      });
      (result.body as Readable).on("error", reject);
    });
  } else if (typeof result.body === "string") {
    res.end(Buffer.from(result.body, "utf-8"));
  } else {
    res.end(result.body);
  }

  return res.getCapture();
}

// ─── Route Registration Helper ────────────────────────────────────────────────

/**
 * Extracts the handler function registered via mockApi.registerHttpRoute.
 * Usage: getRegisteredHandler(mockApi.registerHttpRoute.mock.calls[0][0])
 */
export function getRegisteredHandler(
  call: { handler: Handler } | undefined,
): Handler | undefined {
  return call?.handler;
}
