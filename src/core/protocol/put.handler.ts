import * as path from "node:path";
import { Readable } from "node:stream";
import type { HandlerResult, ParsedRequest, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";
import { validatePath } from "../storage/pathValidation.js";
import { buildErrorXml } from "../util/errorXml.js";

export interface PutHandlerOptions {
  workspaceDir: string;
}

export async function handlePut(
  req: ParsedRequest,
  storage: StorageAdapter,
  opts: PutHandlerOptions,
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

  // Check if target is a directory
  try {
    const stat = await storage.stat(normalizedPath);
    if (stat.isDirectory) {
      return { status: 405, headers: { Allow: "PROPFIND, OPTIONS" }, body: undefined };
    }
  } catch (err) {
    if (!(err instanceof StorageError && err.code === "ENOENT")) {
      throw err;
    }
  }

  // Check if file already exists (for 201 vs 204)
  const existed = await storage.exists(normalizedPath);

  // Ensure parent directories exist, creating them if needed
  const parentDir = path.dirname(normalizedPath);
  try {
    await ensureParentDirs(parentDir, opts.workspaceDir, storage);
  } catch (err) {
    if (err instanceof StorageError) {
      if (err.code === "EACCES") {
        // Parent path component is a file
        return {
          status: 409,
          headers: { "Content-Type": "application/xml" },
          body: buildErrorXml("no-conflicting-lock"),
        };
      }
    }
    throw err;
  }

  // Stream body to storage
  await streamBodyToStorage(req.body, normalizedPath, storage);

  return {
    status: existed ? 204 : 201,
    headers: {},
    body: undefined,
  };
}

async function ensureParentDirs(
  dirPath: string,
  workspaceDir: string,
  storage: StorageAdapter,
): Promise<void> {
  if (dirPath === workspaceDir || dirPath === path.dirname(dirPath)) {
    return;
  }

  const exists = await storage.exists(dirPath);
  if (exists) {
    const stat = await storage.stat(dirPath);
    if (stat.isFile) {
      throw new StorageError("EACCES", dirPath, "parent path component is a file");
    }
    return;
  }

  // Recursively ensure parent exists first
  await ensureParentDirs(path.dirname(dirPath), workspaceDir, storage);

  // Check again after recursion (parent might be a file)
  const parentStat = await storage.stat(path.dirname(dirPath));
  if (parentStat.isFile) {
    throw new StorageError("EACCES", path.dirname(dirPath), "parent path component is a file");
  }

  await storage.mkdir(dirPath);
}

async function streamBodyToStorage(
  body: Buffer,
  filePath: string,
  storage: StorageAdapter,
): Promise<void> {
  const writeStream = storage.createWriteStream(filePath);

  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);

    const readable = Readable.from([body]);
    readable.pipe(writeStream);
  });
}
