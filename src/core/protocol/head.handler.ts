import type { HandlerResult, ParsedRequest, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";
import { validatePath } from "../storage/pathValidation.js";
import { buildDirectoryListingHtml, buildFileHeaders } from "./get.handler.js";

export interface HeadHandlerOptions {
  workspaceDir: string;
  routePrefix?: string;
}

export async function handleHead(
  req: ParsedRequest,
  storage: StorageAdapter,
  opts: HeadHandlerOptions,
): Promise<HandlerResult> {
  const validation = validatePath(req.path, opts.workspaceDir);
  if (!validation.valid) {
    return { status: validation.errorCode, headers: {}, body: undefined };
  }

  const { normalizedPath } = validation;

  let resourceStat;
  try {
    resourceStat = await storage.stat(normalizedPath);
  } catch (err) {
    if (err instanceof StorageError && err.code === "ENOENT") {
      return { status: 404, headers: {}, body: undefined };
    }
    throw err;
  }

  if (resourceStat.isDirectory) {
    const { byteLength } = await buildDirectoryListingHtml(
      storage,
      normalizedPath,
      req.path,
      opts.routePrefix,
    );
    return {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": byteLength,
        "Last-Modified": resourceStat.mtime.toUTCString(),
      },
      body: undefined,
    };
  }

  const headers = await buildFileHeaders(normalizedPath, storage);

  return {
    status: 200,
    headers,
    body: undefined,
  };
}
