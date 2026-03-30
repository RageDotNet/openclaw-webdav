/**
 * Standalone WebDAV conformance test server.
 * Wires all core handlers to a real Node.js HTTP server (no OpenClaw).
 * Used by `npm run test:conformance` to run litmus against the core layer.
 */
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import * as fsp from "node:fs/promises";
import { Readable } from "node:stream";

import { handleOptions } from "../../src/core/protocol/options.handler.js";
import { handleGet } from "../../src/core/protocol/get.handler.js";
import { handleHead } from "../../src/core/protocol/head.handler.js";
import { handlePropfind, handleProppatch } from "../../src/core/protocol/propfind.handler.js";
import { handlePut } from "../../src/core/protocol/put.handler.js";
import { handleDelete } from "../../src/core/protocol/delete.handler.js";
import { handleMkcol } from "../../src/core/protocol/mkcol.handler.js";
import { handleCopy } from "../../src/core/protocol/copy.handler.js";
import { handleMove } from "../../src/core/protocol/move.handler.js";
import { handleLock } from "../../src/core/protocol/lock.handler.js";
import { handleUnlock } from "../../src/core/protocol/unlock.handler.js";
import { NodeFsStorageAdapter } from "../../src/core/storage/nodeFsAdapter.js";
import { InMemoryLockManager } from "../../src/core/locks/lockManager.js";
import type { HandlerResult, ParsedRequest } from "../../src/types.js";

const PORT = parseInt(process.env.PORT ?? "8765", 10);
const workspaceDir = path.join(os.tmpdir(), `webdav-conformance-${Date.now()}`);

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf("?");
  if (idx === -1) return {};
  const params = new URLSearchParams(url.slice(idx + 1));
  const result: Record<string, string> = {};
  for (const [k, v] of params.entries()) result[k] = v;
  return result;
}

function parsePath(url: string): string {
  const idx = url.indexOf("?");
  return idx === -1 ? url : url.slice(0, idx);
}

async function sendResult(res: http.ServerResponse, result: HandlerResult): Promise<void> {
  res.writeHead(result.status, result.headers as http.OutgoingHttpHeaders);

  if (result.body === undefined || result.body === null) {
    res.end();
  } else if (result.body instanceof Readable) {
    await new Promise<void>((resolve, reject) => {
      (result.body as Readable).pipe(res);
      (result.body as Readable).on("end", resolve);
      (result.body as Readable).on("error", reject);
    });
  } else if (typeof result.body === "string") {
    res.end(Buffer.from(result.body, "utf-8"));
  } else {
    res.end(result.body);
  }
}

async function main() {
  await fsp.mkdir(workspaceDir, { recursive: true });
  console.log(`WebDAV conformance server root: ${workspaceDir}`);

  const storage = new NodeFsStorageAdapter();
  const lockManager = new InMemoryLockManager();
  // Use 127.0.0.1 to match what litmus sends in Destination headers
  const serverHost = `127.0.0.1:${PORT}`;
  const handlerOpts = { workspaceDir, serverHost, lockManager };

  const server = http.createServer(async (req, res) => {
    if (process.env.DEBUG_WEBDAV) {
      console.log(`${req.method} ${req.url} If:${req.headers["if"] ?? "(none)"}`);
    }
    const body = await readBody(req);
    const url = req.url ?? "/";
    const parsedReq: ParsedRequest = {
      method: req.method?.toUpperCase() ?? "GET",
      path: parsePath(url),
      query: parseQuery(url),
      headers: req.headers,
      body,
    };

    let result: HandlerResult;
    try {
      switch (parsedReq.method) {
        case "OPTIONS":
          result = handleOptions(parsedReq);
          break;
        case "GET":
          result = await handleGet(parsedReq, storage, handlerOpts);
          break;
        case "HEAD":
          result = await handleHead(parsedReq, storage, handlerOpts);
          break;
        case "PROPFIND":
          result = await handlePropfind(parsedReq, storage, handlerOpts);
          break;
        case "PROPPATCH":
          result = handleProppatch(parsedReq);
          break;
        case "PUT":
          result = await handlePut(parsedReq, storage, handlerOpts);
          break;
        case "DELETE":
          result = await handleDelete(parsedReq, storage, handlerOpts);
          break;
        case "MKCOL":
          result = await handleMkcol(parsedReq, storage, handlerOpts);
          break;
        case "COPY":
          result = await handleCopy(parsedReq, storage, handlerOpts);
          break;
        case "MOVE":
          result = await handleMove(parsedReq, storage, handlerOpts);
          break;
        case "LOCK":
          result = await handleLock(parsedReq, lockManager, handlerOpts);
          break;
        case "UNLOCK":
          result = await handleUnlock(parsedReq, lockManager, handlerOpts);
          break;
        default:
          result = { status: 405, headers: { Allow: "OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, COPY, MOVE, PROPFIND, LOCK, UNLOCK" }, body: undefined };
      }
    } catch (err) {
      console.error("Handler error:", err);
      result = { status: 500, headers: {}, body: "Internal Server Error" };
    }

    await sendResult(res, result);
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`WebDAV conformance server listening on http://127.0.0.1:${PORT}`);
    console.log(`Run: litmus http://127.0.0.1:${PORT}/ basic copymove props locks`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    server.close();
    lockManager.destroy();
    fsp.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
  });
  process.on("SIGINT", () => {
    server.close();
    lockManager.destroy();
    fsp.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
