import * as path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { create } from "xmlbuilder2";
import type { HandlerResult, ParsedRequest, StatResult, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";
import { validatePath } from "../storage/pathValidation.js";
import { buildErrorXml } from "../util/errorXml.js";

export interface PropfindHandlerOptions {
  workspaceDir: string;
  /** Maximum recursion depth for Depth:infinity (default 20) */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 20;

interface ResourceInfo {
  href: string;
  stat: StatResult;
  filePath: string;
}

function buildHrefForResource(filePath: string, workspaceDir: string, isDir: boolean): string {
  const normalized = filePath.replace(/\\/g, "/");
  const normalizedWs = workspaceDir.replace(/\\/g, "/");
  const rel = path.posix.relative(normalizedWs, normalized);
  if (rel === "" || rel === ".") return "/";
  return "/" + rel + (isDir ? "/" : "");
}

function buildEtag(stat: StatResult): string {
  return `"${stat.mtime.getTime().toString(16)}-${stat.size.toString(16)}"`;
}

const DEPTH_LIMIT_SENTINEL = "__DEPTH_LIMIT__";

export async function handlePropfind(
  req: ParsedRequest,
  storage: StorageAdapter,
  opts: PropfindHandlerOptions,
): Promise<HandlerResult> {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const depthHeader = (req.headers["depth"] as string | undefined) ?? "infinity";

  // Validate XML body if present (RFC 4918 requires 400 for malformed XML)
  if (req.body.length > 0) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(req.body.toString("utf-8"), "application/xml");
      const parseErrors = doc.getElementsByTagName("parsererror");
      if (parseErrors.length > 0) {
        return {
          status: 400,
          headers: { "Content-Type": "application/xml" },
          body: buildErrorXml("no-external-entities"),
        };
      }
    } catch {
      return {
        status: 400,
        headers: { "Content-Type": "application/xml" },
        body: buildErrorXml("no-external-entities"),
      };
    }
  }

  const validation = validatePath(req.path, opts.workspaceDir);
  if (!validation.valid) {
    return {
      status: validation.errorCode,
      headers: { "Content-Type": "application/xml" },
      body: buildErrorXml("no-conflicting-lock"),
    };
  }

  const { normalizedPath } = validation;

  let rootStat: StatResult;
  try {
    rootStat = await storage.stat(normalizedPath);
  } catch (err) {
    if (err instanceof StorageError && err.code === "ENOENT") {
      return { status: 404, headers: {}, body: undefined };
    }
    throw err;
  }

  const resources: ResourceInfo[] = [];
  let depthLimitHit = false;

  async function collect(filePath: string, stat: StatResult, currentDepth: number): Promise<void> {
    if (depthLimitHit) return;

    const href = buildHrefForResource(filePath, opts.workspaceDir, stat.isDirectory);
    resources.push({ href, stat, filePath });

    if (!stat.isDirectory) return;
    if (depthHeader === "0") return;
    if (depthHeader === "1" && currentDepth >= 1) return;
    if (depthHeader === "infinity" && currentDepth >= maxDepth) {
      depthLimitHit = true;
      return;
    }

    const children = await storage.readdir(filePath);
    for (const child of children) {
      if (depthLimitHit) return;
      const childPath = path.join(filePath, child);
      let childStat: StatResult;
      try {
        childStat = await storage.stat(childPath);
      } catch {
        continue;
      }
      await collect(childPath, childStat, currentDepth + 1);
    }
  }

  await collect(normalizedPath, rootStat, 0);

  if (depthLimitHit) {
    return {
      status: 403,
      headers: { "Content-Type": "application/xml" },
      body: buildErrorXml("propfind-finite-depth"),
    };
  }

  // Build 207 Multi-Status XML
  const doc = create({ version: "1.0", encoding: "utf-8" }).ele("D:multistatus", {
    "xmlns:D": "DAV:",
  });

  for (const resource of resources) {
    const response = doc.ele("D:response");
    response.ele("D:href").txt(resource.href);

    const propstat = response.ele("D:propstat");
    const prop = propstat.ele("D:prop");

    prop.ele("D:creationdate").txt(resource.stat.ctime.toISOString());

    if (resource.stat.isFile) {
      prop.ele("D:getcontentlength").txt(String(resource.stat.size));
      prop.ele("D:getcontenttype").txt("application/octet-stream");
    }

    prop.ele("D:getetag").txt(buildEtag(resource.stat));
    prop.ele("D:getlastmodified").txt(resource.stat.mtime.toUTCString());

    const resourcetype = prop.ele("D:resourcetype");
    if (resource.stat.isDirectory) {
      resourcetype.ele("D:collection");
    }

    const supportedlock = prop.ele("D:supportedlock");
    const lockentry = supportedlock.ele("D:lockentry");
    lockentry.ele("D:lockscope").ele("D:exclusive");
    lockentry.ele("D:locktype").ele("D:write");

    propstat.ele("D:status").txt("HTTP/1.1 200 OK");
  }

  const xml = doc.end({ prettyPrint: false });

  return {
    status: 207,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Length": Buffer.byteLength(xml),
    },
    body: xml,
  };
}

/**
 * PROPPATCH stub — returns 405 Method Not Allowed per WD-11 spec.
 */
export function handleProppatch(_req: ParsedRequest): HandlerResult {
  return {
    status: 405,
    headers: { Allow: "PROPFIND" },
    body: undefined,
  };
}
