import * as path from "node:path";
import type { HandlerResult, LockManager, ParsedRequest, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";
import { validatePath } from "../storage/pathValidation.js";
import { buildErrorXml } from "../util/errorXml.js";
import { PreconditionError, checkPreconditions } from "./preconditions.js";

export interface DeleteHandlerOptions {
  workspaceDir: string;
  lockManager?: LockManager;
}

export async function handleDelete(
  req: ParsedRequest,
  storage: StorageAdapter,
  opts: DeleteHandlerOptions,
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
  const depthHeader = (req.headers["depth"] as string | undefined) ?? "infinity";

  // Check preconditions (If: header / lock check)
  if (opts.lockManager) {
    try {
      await checkPreconditions(req, normalizedPath, opts.lockManager);
    } catch (err) {
      if (err instanceof PreconditionError) {
        return { status: err.code, headers: { "Content-Type": "application/xml" }, body: buildErrorXml("precondition-failed") };
      }
      throw err;
    }
  }

  let stat;
  try {
    stat = await storage.stat(normalizedPath);
  } catch (err) {
    if (err instanceof StorageError && err.code === "ENOENT") {
      return { status: 404, headers: {}, body: undefined };
    }
    throw err;
  }

  if (stat.isFile) {
    await storage.unlink(normalizedPath);
    return { status: 204, headers: {}, body: undefined };
  }

  // Directory deletion
  if (depthHeader === "0") {
    // Depth:0 on non-empty collection → 409
    const children = await storage.readdir(normalizedPath);
    if (children.length > 0) {
      return {
        status: 409,
        headers: { "Content-Type": "application/xml" },
        body: buildErrorXml("no-conflicting-lock"),
      };
    }
    await storage.rmdir(normalizedPath);
  } else {
    // Depth:infinity — recursive delete
    await deleteRecursive(normalizedPath, storage);
  }

  return { status: 204, headers: {}, body: undefined };
}

async function deleteRecursive(dirPath: string, storage: StorageAdapter): Promise<void> {
  const children = await storage.readdir(dirPath);
  for (const child of children) {
    const childPath = path.join(dirPath, child);
    const childStat = await storage.stat(childPath);
    if (childStat.isDirectory) {
      await deleteRecursive(childPath, storage);
    } else {
      await storage.unlink(childPath);
    }
  }
  await storage.rmdir(dirPath);
}
