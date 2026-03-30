/**
 * HTTP adapter layer — translates OpenClaw req/res objects to/from
 * ParsedRequest/HandlerResult. Contains zero WebDAV protocol logic.
 */
import { Readable } from "node:stream";
import type { HandlerResult, ParsedRequest } from "../types.js";

/**
 * Minimal interface for an OpenClaw HTTP request object.
 * Matches the shape of Node.js http.IncomingMessage.
 */
export interface OpenClawRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: "data", listener: (chunk: Buffer) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
}

/**
 * Minimal interface for an OpenClaw HTTP response object.
 * Matches the shape of Node.js http.ServerResponse.
 */
export interface OpenClawResponse {
  writeHead(statusCode: number, headers?: Record<string, string | string[] | number>): void;
  write(chunk: Buffer | string): void;
  end(chunk?: Buffer | string): void;
}

function parsePath(url: string): string {
  const idx = url.indexOf("?");
  return idx === -1 ? url : url.slice(0, idx);
}

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf("?");
  if (idx === -1) return {};
  const params = new URLSearchParams(url.slice(idx + 1));
  const result: Record<string, string> = {};
  for (const [k, v] of params.entries()) result[k] = v;
  return result;
}

function readBody(req: OpenClawRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Parse an OpenClaw request into a ParsedRequest.
 * Reads the full body into a Buffer.
 */
export async function parseOpenClawRequest(req: OpenClawRequest): Promise<ParsedRequest> {
  const url = req.url ?? "/";
  const body = await readBody(req);

  // Normalize headers to lowercase string values
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      headers[key.toLowerCase()] = value;
    }
  }

  return {
    method: (req.method ?? "GET").toUpperCase(),
    path: parsePath(url),
    query: parseQuery(url),
    headers,
    body,
  };
}

/**
 * Write a HandlerResult to an OpenClaw response.
 * Handles string, Buffer, and Readable stream bodies.
 */
export async function sendHandlerResult(
  res: OpenClawResponse,
  result: HandlerResult,
): Promise<void> {
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
    res.end(result.body as Buffer);
  }
}
