import * as url from "node:url";
import type { HandlerResult, ParsedRequest, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";
import { validatePath } from "../storage/pathValidation.js";
import { buildErrorXml } from "../util/errorXml.js";

export interface CopyHandlerOptions {
  workspaceDir: string;
  /** The host of this server, used to detect cross-server destinations */
  serverHost?: string;
}

function parseDestination(
  destinationHeader: string,
  serverHost: string | undefined,
  workspaceDir: string,
): { valid: false; status: number; body: string } | { valid: true; destPath: string; existed: boolean } {
  let destUrl: URL;
  try {
    destUrl = new URL(destinationHeader);
  } catch {
    return { valid: false, status: 400, body: buildErrorXml("no-conflicting-lock") };
  }

  // Cross-server check
  if (serverHost && destUrl.host !== serverHost) {
    return { valid: false, status: 502, body: buildErrorXml("no-conflicting-lock") };
  }

  const destPathRaw = decodeURIComponent(destUrl.pathname);
  const validation = validatePath(destPathRaw, workspaceDir);
  if (!validation.valid) {
    return { valid: false, status: validation.errorCode, body: buildErrorXml("no-conflicting-lock") };
  }

  return { valid: true, destPath: validation.normalizedPath, existed: false };
}

export async function handleCopy(
  req: ParsedRequest,
  storage: StorageAdapter,
  opts: CopyHandlerOptions,
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

  // Parse destination
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

  // Check destination
  const destExists = await storage.exists(destPath);
  if (destExists && !overwrite) {
    return {
      status: 412,
      headers: { "Content-Type": "application/xml" },
      body: buildErrorXml("precondition-failed"),
    };
  }

  // Perform copy
  await storage.copy(srcPath, destPath);

  return {
    status: destExists ? 204 : 201,
    headers: {},
    body: undefined,
  };
}
