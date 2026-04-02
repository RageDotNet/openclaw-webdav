import { DOMParser } from "@xmldom/xmldom";
import { create } from "xmlbuilder2";
import type { HandlerResult, ILock, LockManager, ParsedRequest } from "../../types.js";
import { LockConflictError } from "../locks/lockManager.js";
import { buildErrorXml } from "../util/errorXml.js";
import { validatePath } from "../storage/pathValidation.js";

export interface LockHandlerOptions {
  workspaceDir: string;
}

const DAV_NS = "DAV:";

interface ParsedLockInfo {
  scope: "exclusive" | "shared";
  owner: string;
}

function parseTimeoutHeader(header: string | undefined): number {
  if (!header) return 3600;
  if (header.toLowerCase() === "infinite") return 86400;
  const match = header.match(/Second-(\d+)/i);
  if (match) return parseInt(match[1], 10);
  return 3600;
}

function parseLockInfo(body: Buffer): ParsedLockInfo | null {
  if (body.length === 0) {
    // Refresh request — no lockinfo body
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(body.toString("utf-8"), "application/xml");
  } catch {
    return null;
  }

  // Check for parse errors
  const parseErrors = doc.getElementsByTagName("parsererror");
  if (parseErrors.length > 0) return null;

  const lockinfo = doc.getElementsByTagNameNS(DAV_NS, "lockinfo")[0];
  if (!lockinfo) return null;

  const lockscopeEl = lockinfo.getElementsByTagNameNS(DAV_NS, "lockscope")[0];
  const locktypeEl = lockinfo.getElementsByTagNameNS(DAV_NS, "locktype")[0];

  if (!lockscopeEl || !locktypeEl) return null;

  const exclusiveEl = lockscopeEl.getElementsByTagNameNS(DAV_NS, "exclusive")[0];
  const sharedEl = lockscopeEl.getElementsByTagNameNS(DAV_NS, "shared")[0];

  const scope: "exclusive" | "shared" = exclusiveEl ? "exclusive" : sharedEl ? "shared" : "exclusive";

  // Owner element — store as opaque XML string verbatim
  const ownerEl = lockinfo.getElementsByTagNameNS(DAV_NS, "owner")[0];
  const owner = ownerEl ? ownerEl.toString() : "<D:owner/>";

  return { scope, owner };
}

function buildLockDiscoveryXml(lock: ILock): string {
  const doc = create({ version: "1.0", encoding: "utf-8" })
    .ele("D:prop", { "xmlns:D": "DAV:" })
    .ele("D:lockdiscovery")
    .ele("D:activelock");

  doc.ele("D:locktype").ele("D:write");
  doc.ele("D:lockscope").ele(lock.scope === "exclusive" ? "D:exclusive" : "D:shared");
  doc.ele("D:depth").txt(lock.depth);
  doc.ele("D:owner").txt(lock.owner);
  doc.ele("D:timeout").txt(`Second-${Math.max(0, Math.floor((lock.expiresAt.getTime() - Date.now()) / 1000))}`);

  const locktoken = doc.ele("D:locktoken");
  locktoken.ele("D:href").txt(lock.token);

  return doc.root().end({ prettyPrint: false });
}

export async function handleLock(
  req: ParsedRequest,
  lockManager: LockManager,
  opts: LockHandlerOptions,
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
  const depth: "0" | "infinity" = depthHeader === "0" ? "0" : "infinity";
  const timeoutSeconds = parseTimeoutHeader(req.headers["timeout"] as string | undefined);

  // Parse lockinfo XML
  const lockInfo = parseLockInfo(req.body);

  if (req.body.length > 0 && !lockInfo) {
    return {
      status: 400,
      headers: { "Content-Type": "application/xml" },
      body: buildErrorXml("no-conflicting-lock"),
    };
  }

  // LOCK refresh: empty body + If: header with existing token
  if (req.body.length === 0) {
    const ifHeader = req.headers["if"] as string | undefined;
    if (ifHeader) {
      const tokenMatch = ifHeader.match(/\(<(opaquelocktoken:[^>]+)>\)/);
      if (tokenMatch) {
        const token = tokenMatch[1];
        try {
          await lockManager.refresh(token, timeoutSeconds);
          const locks = await lockManager.getLocks(normalizedPath);
          const refreshedLock = locks.find((l) => l.token === token);
          if (refreshedLock) {
            const responseXml = buildLockDiscoveryXml(refreshedLock);
            return {
              status: 200,
              headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Lock-Token": `<${token}>`,
                "Content-Length": Buffer.byteLength(responseXml),
              },
              body: responseXml,
            };
          }
        } catch {
          // Fall through to new lock attempt
        }
      }
    }
  }

  const scope = lockInfo?.scope ?? "exclusive";
  const owner = lockInfo?.owner ?? "<D:owner/>";

  // Attempt to acquire lock
  let lock: ILock;
  try {
    lock = await lockManager.lock(normalizedPath, owner, scope, depth, timeoutSeconds);
  } catch (err) {
    if (err instanceof LockConflictError) {
      const conflictXml = buildLockDiscoveryXml(err.existingLock);
      return {
        status: 423,
        headers: { "Content-Type": "application/xml" },
        body: conflictXml,
      };
    }
    throw err;
  }

  const responseXml = buildLockDiscoveryXml(lock);

  return {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Lock-Token": `<${lock.token}>`,
      "Content-Length": Buffer.byteLength(responseXml),
    },
    body: responseXml,
  };
}
