import * as path from "node:path";
import mime from "mime-types";
import type { HandlerResult, ParsedRequest, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";
import { validatePath } from "../storage/pathValidation.js";
import { formatWebDavEtag } from "../util/webDavEtag.js";
import { buildErrorXml } from "../util/errorXml.js";
import { normalizeRoutePrefix } from "../util/routePrefix.js";

export interface GetHandlerOptions {
  workspaceDir: string;
  /** Gateway mount path for hyperlinks in HTML directory listings (e.g. `/webdav`). */
  routePrefix?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Path-absolute URL path for a child of the collection at `parentReqPath`. */
function childPublicPath(parentReqPath: string, name: string, isDir: boolean): string {
  const clean = parentReqPath.startsWith("/") ? parentReqPath : `/${parentReqPath}`;
  const base = clean === "/" ? "" : clean.replace(/\/+$/, "");
  const enc = encodeURIComponent(name);
  const suffix = isDir ? "/" : "";
  if (base === "") {
    return `/${enc}${suffix}`;
  }
  return `${base}/${enc}${suffix}`;
}

function withMount(absPath: string, routePrefix?: string): string {
  const mount = normalizeRoutePrefix(routePrefix);
  if (!mount) {
    return absPath;
  }
  if (absPath === "/") {
    return `${mount}/`;
  }
  return `${mount}${absPath}`;
}

/** Parent collection path, or null if `parentReqPath` is already the workspace root. */
function parentPublicPath(parentReqPath: string): string | null {
  const normalized = parentReqPath.replace(/\/+/g, "/").replace(/\/$/, "") || "";
  if (normalized === "" || normalized === "/") {
    return null;
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "/";
  }
  parts.pop();
  return `/${parts.join("/")}`;
}

function indexTitlePath(reqPath: string, routePrefix?: string): string {
  let p = (reqPath.startsWith("/") ? reqPath : `/${reqPath}`).replace(/\/+/g, "/");
  if (p !== "/" && !p.endsWith("/")) {
    p = `${p}/`;
  }
  return withMount(p, routePrefix);
}

/**
 * Minimal HTML directory index for browsers. WebDAV clients use PROPFIND instead.
 */
export async function buildDirectoryListingHtml(
  storage: StorageAdapter,
  dirPath: string,
  reqPath: string,
  routePrefix?: string,
): Promise<{ html: string; byteLength: number }> {
  const names = await storage.readdir(dirPath);
  names.sort((a, b) => a.localeCompare(b));

  const titlePath = indexTitlePath(reqPath, routePrefix);

  const lines: string[] = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>Index of ${escapeHtml(titlePath)}</title>`,
    "<style>",
    "body{font-family:system-ui,sans-serif;margin:1.25rem;line-height:1.5;}",
    "ul{list-style:none;padding:0;margin:0;}",
    "li{margin:0.35rem 0;}",
    "a{color:#06c;text-decoration:none;}",
    "a:hover{text-decoration:underline;}",
    ".muted{color:#555;font-size:0.9rem;margin:0.75rem 0;}",
    "</style>",
    "</head>",
    "<body>",
    `<h1>Index of ${escapeHtml(titlePath)}</h1>`,
    '<p class="muted">WebDAV clients list folders via PROPFIND; this page is for normal browsers.</p>',
  ];

  const parent = parentPublicPath(reqPath);
  if (parent !== null) {
    const href = withMount(parent === "/" ? "/" : `${parent}/`, routePrefix);
    lines.push(`<p><a href="${escapeHtml(href)}">Parent directory</a></p>`);
  }

  lines.push("<ul>");

  for (const name of names) {
    const child = path.join(dirPath, name);
    let st;
    try {
      st = await storage.stat(child);
    } catch {
      continue;
    }
    const rel = childPublicPath(reqPath, name, st.isDirectory);
    const href = withMount(rel, routePrefix);
    const label = st.isDirectory ? `${name}/` : name;
    lines.push(
      `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`,
    );
  }

  lines.push("</ul>", "</body>", "</html>");
  const html = `${lines.join("\n")}\n`;
  return { html, byteLength: Buffer.byteLength(html, "utf8") };
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
    const { html, byteLength } = await buildDirectoryListingHtml(
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
      body: html,
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
