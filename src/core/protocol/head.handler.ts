import type { HandlerResult, ParsedRequest, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";
import { validatePath } from "../storage/pathValidation.js";
import { buildFileHeaders } from "./get.handler.js";

export interface HeadHandlerOptions {
  workspaceDir: string;
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

  return {
    status: 200,
    headers,
    body: undefined,
  };
}
