import type { HandlerResult, LockManager, ParsedRequest } from "../../types.js";
import { LockNotFoundError } from "../locks/lockManager.js";
import { buildErrorXml } from "../util/errorXml.js";
import { validatePath } from "../storage/pathValidation.js";

export interface UnlockHandlerOptions {
  workspaceDir: string;
}

const OPAQUE_LOCK_TOKEN_RE = /^<(opaquelocktoken:[0-9a-f-]+)>$/i;

export async function handleUnlock(
  req: ParsedRequest,
  lockManager: LockManager,
  opts: UnlockHandlerOptions,
): Promise<HandlerResult> {
  const lockTokenHeader = req.headers["lock-token"] as string | undefined;

  // 400 if Lock-Token header is missing or malformed
  if (!lockTokenHeader) {
    return {
      status: 400,
      headers: { "Content-Type": "application/xml" },
      body: buildErrorXml("lock-token-submitted"),
    };
  }

  const match = OPAQUE_LOCK_TOKEN_RE.exec(lockTokenHeader);
  if (!match) {
    return {
      status: 400,
      headers: { "Content-Type": "application/xml" },
      body: buildErrorXml("lock-token-submitted"),
    };
  }

  const token = match[1];

  const validation = validatePath(req.path, opts.workspaceDir);
  if (!validation.valid) {
    return {
      status: validation.errorCode,
      headers: { "Content-Type": "application/xml" },
      body: buildErrorXml("no-conflicting-lock"),
    };
  }

  const { normalizedPath } = validation;

  try {
    await lockManager.unlock(normalizedPath, token);
  } catch (err) {
    if (err instanceof LockNotFoundError) {
      return {
        status: 409,
        headers: { "Content-Type": "application/xml" },
        body: buildErrorXml("lock-token-matches-request-uri"),
      };
    }
    throw err;
  }

  return { status: 204, headers: {}, body: undefined };
}
