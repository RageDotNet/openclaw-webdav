import * as path from "node:path";
import type { HandlerResult, ParsedRequest, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";
import { validatePath } from "../storage/pathValidation.js";
import { buildErrorXml } from "../util/errorXml.js";

export interface MkcolHandlerOptions {
  workspaceDir: string;
}

export async function handleMkcol(
  req: ParsedRequest,
  storage: StorageAdapter,
  opts: MkcolHandlerOptions,
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

  // 415 if request body is non-empty
  if (req.body.length > 0) {
    return { status: 415, headers: {}, body: undefined };
  }

  // 405 if path already exists
  const exists = await storage.exists(normalizedPath);
  if (exists) {
    return { status: 405, headers: { Allow: "DELETE, PUT" }, body: undefined };
  }

  // 409 if parent does not exist or parent is a file
  const parentDir = path.dirname(normalizedPath);
  let parentExists: boolean;
  try {
    const parentStat = await storage.stat(parentDir);
    parentExists = true;
    if (parentStat.isFile) {
      return {
        status: 409,
        headers: { "Content-Type": "application/xml" },
        body: buildErrorXml("no-conflicting-lock"),
      };
    }
  } catch (err) {
    if (err instanceof StorageError && err.code === "ENOENT") {
      parentExists = false;
    } else {
      throw err;
    }
  }

  if (!parentExists) {
    return {
      status: 409,
      headers: { "Content-Type": "application/xml" },
      body: buildErrorXml("no-conflicting-lock"),
    };
  }

  // Create the collection — without recursive per WebDAV spec
  try {
    await storage.mkdir(normalizedPath);
  } catch (err) {
    if (err instanceof StorageError && err.code === "EEXIST") {
      return { status: 405, headers: { Allow: "DELETE, PUT" }, body: undefined };
    }
    throw err;
  }

  return { status: 201, headers: {}, body: undefined };
}
