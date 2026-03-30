import type { LockManager, ParsedRequest, StorageAdapter } from "../../types.js";
import { StorageError } from "../../types.js";

/**
 * Typed error thrown when an If: header precondition fails.
 * Write handlers catch this and return the appropriate HTTP status.
 */
export class PreconditionError extends Error {
  readonly code: 412 | 423;

  constructor(code: 412 | 423, message?: string) {
    super(message ?? (code === 412 ? "Precondition Failed" : "Locked"));
    this.name = "PreconditionError";
    this.code = code;
  }
}

/** A single condition within an If: list */
interface IfCondition {
  /** The token URI (opaquelocktoken:... or DAV:no-lock) */
  token?: string;
  /** ETag string including quotes, e.g. '"abc123"' */
  etag?: string;
  /** Whether this condition is negated (Not keyword) */
  negated: boolean;
}

/** One parenthesized list in the If: header */
interface IfList {
  /** Optional tagged resource URL (from "If: <url> (...)") */
  taggedUrl?: string;
  conditions: IfCondition[];
}

/**
 * Parse the If: header into a list of condition lists.
 * Handles RFC 4918 §10.4 formats:
 *   If: (<token>)
 *   If: (<token> ["etag"])
 *   If: (Not <token>)
 *   If: (<token1>) (<token2>)
 *   If: <url> (<token>)
 *   If: (<token> ["etag"]) (Not <DAV:no-lock> ["etag"])
 */
export function parseIfHeader(ifHeader: string): string[] {
  // Legacy API: return just the opaquelocktoken URIs for backward compat
  const tokens: string[] = [];
  const re = /<(opaquelocktoken:[^>]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(ifHeader)) !== null) {
    tokens.push(match[1]);
  }
  return tokens;
}

/**
 * Parse the If: header into structured condition lists.
 */
function parseIfLists(ifHeader: string): IfList[] {
  const lists: IfList[] = [];
  let i = 0;
  const len = ifHeader.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(ifHeader[i])) i++;
    if (i >= len) break;

    // Check for tagged URL: <url>
    let taggedUrl: string | undefined;
    if (ifHeader[i] === "<") {
      const end = ifHeader.indexOf(">", i);
      if (end === -1) break;
      const url = ifHeader.slice(i + 1, end);
      // Check if this is a tagged URL (not inside a list)
      // Tagged URLs appear before a list: <url> (...)
      i = end + 1;
      while (i < len && /\s/.test(ifHeader[i])) i++;
      if (i < len && ifHeader[i] === "(") {
        taggedUrl = url;
      } else {
        // Not followed by a list, skip
        continue;
      }
    }

    // Parse a list: (...)
    if (i < len && ifHeader[i] === "(") {
      const listStart = i;
      // Find matching close paren (simple, no nesting)
      let depth = 0;
      let j = i;
      while (j < len) {
        if (ifHeader[j] === "(") depth++;
        else if (ifHeader[j] === ")") {
          depth--;
          if (depth === 0) break;
        }
        j++;
      }
      const listContent = ifHeader.slice(listStart + 1, j);
      i = j + 1;

      const conditions = parseConditions(listContent);
      lists.push({ taggedUrl, conditions });
    } else {
      i++;
    }
  }

  return lists;
}

function parseConditions(content: string): IfCondition[] {
  const conditions: IfCondition[] = [];
  let i = 0;
  const len = content.length;

  while (i < len) {
    while (i < len && /\s/.test(content[i])) i++;
    if (i >= len) break;

    let negated = false;

    // Check for "Not" keyword
    if (content.slice(i, i + 3).toLowerCase() === "not" && (i + 3 >= len || /\s/.test(content[i + 3]))) {
      negated = true;
      i += 3;
      while (i < len && /\s/.test(content[i])) i++;
    }

    if (i >= len) break;

    if (content[i] === "<") {
      // Token: <uri>
      const end = content.indexOf(">", i);
      if (end === -1) break;
      const token = content.slice(i + 1, end);
      conditions.push({ token, negated });
      i = end + 1;
    } else if (content[i] === "[") {
      // ETag: ["etag"]
      const end = content.indexOf("]", i);
      if (end === -1) break;
      const etag = content.slice(i + 1, end);
      conditions.push({ etag, negated });
      i = end + 1;
    } else {
      i++;
    }
  }

  return conditions;
}

/** Compute ETag for a resource (same formula as get.handler.ts) */
function computeEtag(mtime: Date, size: number): string {
  return `"${mtime.getTime().toString(16)}-${size.toString(16)}"`;
}

/**
 * Evaluate a single If: list against the resource state.
 * Returns an object: { passed, hasLockToken } where:
 * - passed: all conditions in the list are satisfied
 * - hasLockToken: the list contains at least one (non-negated) lock token condition
 */
async function evaluateList(
  list: IfList,
  normalizedPath: string,
  lockManager: LockManager,
  storage: StorageAdapter | undefined,
): Promise<{ passed: boolean; hasLockToken: boolean }> {
  const locks = await lockManager.getLocks(normalizedPath);
  const lockTokens = new Set(locks.map((l) => l.token));

  // Get ETag for the resource if needed
  let resourceEtag: string | undefined;
  if (storage && list.conditions.some((c) => c.etag !== undefined)) {
    try {
      const stat = await storage.stat(normalizedPath);
      resourceEtag = computeEtag(stat.mtime, stat.size);
    } catch (err) {
      if (err instanceof StorageError && err.code === "ENOENT") {
        resourceEtag = undefined;
      } else {
        throw err;
      }
    }
  }

  let hasLockToken = false;

  for (const cond of list.conditions) {
    let condResult: boolean;

    if (cond.token !== undefined) {
      if (cond.token === "DAV:no-lock") {
        // DAV:no-lock is never satisfied (always false)
        condResult = false;
      } else if (cond.token.startsWith("opaquelocktoken:")) {
        // Lock token condition: true if this token is active for this resource
        condResult = lockTokens.has(cond.token);
        if (!cond.negated) hasLockToken = true;
      } else {
        // Unknown token type — treat as false
        condResult = false;
      }
    } else if (cond.etag !== undefined) {
      // ETag condition: true if resource ETag matches
      if (resourceEtag === undefined) {
        condResult = false;
      } else {
        condResult = resourceEtag === cond.etag;
      }
    } else {
      condResult = false;
    }

    if (cond.negated) condResult = !condResult;

    if (!condResult) {
      return { passed: false, hasLockToken }; // AND semantics: one false → whole list fails
    }
  }

  return { passed: true, hasLockToken }; // All conditions passed
}

/**
 * Check If: header preconditions for a write operation.
 *
 * - If resource is locked and no If: header → throw PreconditionError(423)
 * - If If: header present, evaluate all lists (OR semantics across lists):
 *   - If any list passes → allow operation
 *   - If no list passes → throw PreconditionError(412)
 * - If resource is not locked and no If: header → allow operation
 */
export async function checkPreconditions(
  req: ParsedRequest,
  normalizedPath: string,
  lockManager: LockManager,
  storage?: StorageAdapter,
): Promise<void> {
  const ifHeader = req.headers["if"] as string | undefined;
  const locks = await lockManager.getLocks(normalizedPath);
  const isLocked = locks.length > 0;

  if (!isLocked && !ifHeader) {
    return;
  }

  if (isLocked && !ifHeader) {
    throw new PreconditionError(423, `Resource is locked: ${normalizedPath}`);
  }

  if (ifHeader) {
    const lists = parseIfLists(ifHeader);

    if (lists.length === 0) {
      // Malformed or empty If: header
      if (isLocked) {
        throw new PreconditionError(423, `Resource is locked: ${normalizedPath}`);
      }
      return;
    }

    // Evaluate each list (OR semantics: any passing list → allow)
    // When resource is locked, the passing list must also contain a valid lock token
    let anyPassed = false;
    let anyPassedWithLockToken = false;

    for (const list of lists) {
      const { passed, hasLockToken } = await evaluateList(list, normalizedPath, lockManager, storage);
      if (passed) {
        anyPassed = true;
        if (hasLockToken) {
          anyPassedWithLockToken = true;
        }
      }
    }

    if (!anyPassed) {
      throw new PreconditionError(412, "If: header conditions not satisfied");
    }

    // If the resource is locked, require that the passing list included a valid lock token
    if (isLocked && !anyPassedWithLockToken) {
      throw new PreconditionError(423, `Resource is locked: ${normalizedPath}`);
    }
  }
}
