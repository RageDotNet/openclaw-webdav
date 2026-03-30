import * as path from "node:path";
import type { HandlerResult, LockManager, ParsedRequest, StorageAdapter, StatResult } from "../../types.js";
import { StorageError } from "../../types.js";
import { buildErrorXml } from "../util/errorXml.js";
import { validatePath } from "../storage/pathValidation.js";
import { PreconditionError, checkPreconditions } from "./preconditions.js";

export interface MoveHandlerOptions {
  workspaceDir: string;
  serverHost?: string;
  lockManager?: LockManager;
}

function parseDestination(
  destinationHeader: string,
  serverHost: string | undefined,
  workspaceDir: string,
): { valid: false; status: number; body: string } | { valid: true; destPath: string } {
  let destUrl: URL;
  try {
    destUrl = new URL(destinationHeader);
  } catch {
    return { valid: false, status: 400, body: buildErrorXml("no-conflicting-lock") };
  }

  if (serverHost && destUrl.host !== serverHost) {
    return { valid: false, status: 502, body: buildErrorXml("no-conflicting-lock") };
  }

  const destPathRaw = decodeURIComponent(destUrl.pathname);
  const validation = validatePath(destPathRaw, workspaceDir);
  if (!validation.valid) {
    return { valid: false, status: validation.errorCode, body: buildErrorXml("no-conflicting-lock") };
  }

  return { valid: true, destPath: validation.normalizedPath };
}

export async function handleMove(
  req: ParsedRequest,
  storage: StorageAdapter,
  opts: MoveHandlerOptions,
): Promise<HandlerResult> {
  const destinationHeader = req.headers["destination"] as string | undefined;
  if (!destinationHeader) {
    return {
      status: 400,
      headers: { "Content-Type": "application/xml" },
      body: buildErrorXml("no-conflicting-lock"),
    };
  }

  const srcValidation = validatePath(req.path, opts.workspaceDir);
  if (!srcValidation.valid) {
    return {
      status: srcValidation.errorCode,
      headers: { "Content-Type": "application/xml" },
      body: buildErrorXml("no-conflicting-lock"),
    };
  }

  const srcPath = srcValidation.normalizedPath;

  const destResult = parseDestination(destinationHeader, opts.serverHost, opts.workspaceDir);
  if (!destResult.valid) {
    return {
      status: destResult.status,
      headers: { "Content-Type": "application/xml" },
      body: destResult.body,
    };
  }

  const destPath = destResult.destPath;
  const overwrite = (req.headers["overwrite"] as string | undefined)?.toUpperCase() !== "F";

  // Check source exists
  try {
    await storage.stat(srcPath);
  } catch (err) {
    if (err instanceof StorageError && err.code === "ENOENT") {
      return { status: 404, headers: {}, body: undefined };
    }
    throw err;
  }

  // Check preconditions on source
  if (opts.lockManager) {
    try {
      await checkPreconditions(req, srcPath, opts.lockManager);
    } catch (err) {
      if (err instanceof PreconditionError) {
        return { status: err.code, headers: { "Content-Type": "application/xml" }, body: buildErrorXml("precondition-failed") };
      }
      throw err;
    }
  }

  // Check destination
  const destExists = await storage.exists(destPath);
  if (destExists && !overwrite) {
    return {
      status: 412,
      headers: { "Content-Type": "application/xml" },
      body: buildErrorXml("precondition-failed"),
    };
  }

  // If destination exists and overwrite is allowed, remove it first
  if (destExists) {
    await removeRecursive(destPath, storage);
  }

  await storage.rename(srcPath, destPath);

  return {
    status: destExists ? 204 : 201,
    headers: {},
    body: undefined,
  };
}

async function removeRecursive(filePath: string, storage: StorageAdapter): Promise<void> {
  let stat: StatResult;
  try {
    stat = await storage.stat(filePath);
  } catch {
    return;
  }

  if (stat.isFile) {
    await storage.unlink(filePath);
    return;
  }

  const children = await storage.readdir(filePath);
  for (const child of children) {
    await removeRecursive(path.join(filePath, child), storage);
  }
  await storage.rmdir(filePath);
}
