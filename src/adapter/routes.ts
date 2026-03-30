/**
 * Route registration adapter — registers the /webdav/* route via api.registerHttpRoute
 * and dispatches incoming requests to the appropriate core WebDAV handlers.
 */
import type { WebDavConfig } from "./config.js";
import type { StorageAdapter, LockManager, HandlerResult } from "../types.js";
import type { OpenClawRequest, OpenClawResponse } from "./http.js";
import { parseOpenClawRequest, sendHandlerResult } from "./http.js";
import { handleOptions } from "../core/protocol/options.handler.js";
import { handleGet } from "../core/protocol/get.handler.js";
import { handleHead } from "../core/protocol/head.handler.js";
import { handlePropfind, handleProppatch } from "../core/protocol/propfind.handler.js";
import { handlePut } from "../core/protocol/put.handler.js";
import { handleDelete } from "../core/protocol/delete.handler.js";
import { handleMkcol } from "../core/protocol/mkcol.handler.js";
import { handleCopy } from "../core/protocol/copy.handler.js";
import { handleMove } from "../core/protocol/move.handler.js";
import { handleLock } from "../core/protocol/lock.handler.js";
import { handleUnlock } from "../core/protocol/unlock.handler.js";

/** Minimal OpenClaw plugin API surface needed for route registration */
export interface PluginApi {
  registerHttpRoute(opts: {
    path: string;
    auth: string;
    handler: (req: OpenClawRequest, res: OpenClawResponse) => Promise<void>;
  }): void;
  logger: {
    error(message: string, ...args: unknown[]): void;
  };
}

const WRITE_METHODS = new Set(["PUT", "DELETE", "MKCOL", "COPY", "MOVE", "LOCK", "UNLOCK", "PROPPATCH"]);

const METHOD_NOT_ALLOWED: HandlerResult = {
  status: 405,
  headers: {
    Allow: "OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, COPY, MOVE, PROPFIND, LOCK, UNLOCK",
  },
  body: undefined,
};

const READ_ONLY_RESPONSE: HandlerResult = {
  status: 405,
  headers: {
    Allow: "OPTIONS, GET, HEAD, PROPFIND",
  },
  body: "Method not allowed: server is in read-only mode",
};

/**
 * Register the /webdav/* route with OpenClaw.
 * Dispatches requests to core WebDAV handlers based on HTTP method.
 */
export function registerWebDavRoutes(
  api: PluginApi,
  config: WebDavConfig,
  storage: StorageAdapter,
  lockManager: LockManager,
): void {
  const handlerOpts = {
    workspaceDir: config.rootPath,
    serverHost: undefined as string | undefined,
    lockManager,
    routePrefix: "/webdav",
  };

  const maxUploadBytes = config.maxUploadSizeMb * 1024 * 1024;

  api.registerHttpRoute({
    path: "/webdav/*",
    auth: "gateway",
    handler: async (req: OpenClawRequest, res: OpenClawResponse): Promise<void> => {
      let result: HandlerResult;

      try {
        const rawReq = await parseOpenClawRequest(req);
        // Strip the /webdav prefix so handlers see paths relative to the root
        const strippedPath = rawReq.path.replace(/^\/webdav/, "") || "/";
        const parsedReq = { ...rawReq, path: strippedPath };
        const method = parsedReq.method;

        // Read-only mode: block all write methods
        if (config.readOnly && WRITE_METHODS.has(method)) {
          result = READ_ONLY_RESPONSE;
        } else if (method === "PUT" && !config.readOnly) {
          // Enforce upload size limit
          const contentLength = parseInt(
            (parsedReq.headers["content-length"] as string) ?? "0",
            10,
          );
          if (!isNaN(contentLength) && contentLength > maxUploadBytes) {
            result = {
              status: 413,
              headers: { "Content-Type": "text/plain" },
              body: `Upload too large: max ${config.maxUploadSizeMb}MB`,
            };
          } else {
            result = await handlePut(parsedReq, storage, handlerOpts);
          }
        } else {
          result = await dispatch(parsedReq.method, parsedReq, storage, lockManager, handlerOpts);
        }
      } catch (err) {
        api.logger.error("WebDAV handler error", err);
        result = { status: 500, headers: {}, body: "Internal Server Error" };
      }

      await sendHandlerResult(res, result);
    },
  });
}

async function dispatch(
  method: string,
  parsedReq: import("../types.js").ParsedRequest,
  storage: StorageAdapter,
  lockManager: LockManager,
  handlerOpts: { workspaceDir: string; serverHost?: string; lockManager: LockManager },
): Promise<HandlerResult> {
  switch (method) {
    case "OPTIONS":
      return handleOptions(parsedReq);
    case "GET":
      return handleGet(parsedReq, storage, handlerOpts);
    case "HEAD":
      return handleHead(parsedReq, storage, handlerOpts);
    case "PROPFIND":
      return handlePropfind(parsedReq, storage, handlerOpts);
    case "PROPPATCH":
      return handleProppatch(parsedReq);
    case "PUT":
      return handlePut(parsedReq, storage, handlerOpts);
    case "DELETE":
      return handleDelete(parsedReq, storage, handlerOpts);
    case "MKCOL":
      return handleMkcol(parsedReq, storage, handlerOpts);
    case "COPY":
      return handleCopy(parsedReq, storage, handlerOpts);
    case "MOVE":
      return handleMove(parsedReq, storage, handlerOpts);
    case "LOCK":
      return handleLock(parsedReq, lockManager, handlerOpts);
    case "UNLOCK":
      return handleUnlock(parsedReq, lockManager, handlerOpts);
    default:
      return METHOD_NOT_ALLOWED;
  }
}
