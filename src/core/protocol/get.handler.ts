import * as path from "node:path";
import mime from "mime-types";
import type { HandlerResult, ParsedRequest, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";
import { validatePath } from "../storage/pathValidation.js";
import { buildErrorXml } from "../util/errorXml.js";

export interface GetHandlerOptions {
  workspaceDir: string;
}

/**
 * Build the shared response headers for a file resource.
 * Used by both GET and HEAD handlers.
 */
export async function buildFileHeaders(
  filePath: string,
  storage: StorageAdapter,
): Promise<Record<string, string | number>> {
  const stat = await storage.stat(filePath);
  const ext = path.extname(filePath);
  const contentType = (ext && mime.lookup(ext)) || "application/octet-stream";
  const etag = `"${stat.mtime.getTime().toString(16)}-${stat.size.toString(16)}"`;

  return {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Last-Modified": stat.mtime.toUTCString(),
    ETag: etag,
  };
}

export async function handleGet(
  req: ParsedRequest,
  storage: StorageAdapter,
  opts: GetHandlerOptions,
): Promise<HandlerResult> {
  const validation = validatePath(req.path, opts.workspaceDir);
  if (!validation.valid) {
    return {
      status: validation.errorCode,
      headers: { "Content-Type": "application/xml" },
      body: buildErrorXml("no-conflicting-lock"),
    };
  }

  const { normalizedPath } = validation;

  let stat;
  try {
    stat = await storage.stat(normalizedPath);
  } catch (err) {
    if (err instanceof StorageError && err.code === "ENOENT") {
      return { status: 404, headers: {}, body: undefined };
    }
    throw err;
  }

  if (stat.isDirectory) {
    return { status: 405, headers: { Allow: "PROPFIND, OPTIONS" }, body: undefined };
  }

  const headers = await buildFileHeaders(normalizedPath, storage);
  const stream = storage.createReadStream(normalizedPath);

  return {
    status: 200,
    headers,
    body: stream,
  };
}
