import * as path from "node:path";
import mime from "mime-types";
import type { HandlerResult, ParsedRequest, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";
import { validatePath } from "../storage/pathValidation.js";
import { formatWebDavEtag } from "../util/webDavEtag.js";
import { buildErrorXml } from "../util/errorXml.js";

export interface GetHandlerOptions {
  workspaceDir: string;
}

/**
 * UTF-8 plain-text listing for GET on a collection: one entry per line;
 * subdirectories end with `/`. Sorted by locale. File responses use
 * {@link buildFileHeaders} for shared GET/HEAD headers (Content-Type, ETag, etc.).
 */
export async function buildDirectoryListingPlainText(
  storage: StorageAdapter,
  dirPath: string,
): Promise<{ text: string; byteLength: number }> {
  const names = await storage.readdir(dirPath);
  names.sort((a, b) => a.localeCompare(b));
  const lines: string[] = [];
  for (const name of names) {
    const child = path.join(dirPath, name);
    try {
      const st = await storage.stat(child);
      lines.push(st.isDirectory ? `${name}/` : name);
    } catch {
      // omit entries that disappeared between readdir and stat
    }
  }
  const text = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  return { text, byteLength: Buffer.byteLength(text, "utf8") };
}

export async function buildFileHeaders(
  filePath: string,
  storage: StorageAdapter,
): Promise<Record<string, string | number>> {
  const resourceStat = await storage.stat(filePath);
  const ext = path.extname(filePath);
  const contentType = (ext && mime.lookup(ext)) || "application/octet-stream";
  const etag = formatWebDavEtag(resourceStat.mtime, resourceStat.size);

  return {
    "Content-Type": contentType,
    "Content-Length": resourceStat.size,
    "Last-Modified": resourceStat.mtime.toUTCString(),
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
    const { text, byteLength } = await buildDirectoryListingPlainText(storage, normalizedPath);
    return {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": byteLength,
        "Last-Modified": resourceStat.mtime.toUTCString(),
      },
      body: text,
    };
  }

  const headers = await buildFileHeaders(normalizedPath, storage);
  const stream = storage.createReadStream(normalizedPath);

  return {
    status: 200,
    headers,
    body: stream,
  };
}
