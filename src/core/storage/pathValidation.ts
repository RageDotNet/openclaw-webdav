import * as path from "node:path";
import type { ValidationResult } from "../../types.js";

// Windows reserved device names (case-insensitive, with or without extension)
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.[^.]*)?$/i;

// ASCII control characters (0x00–0x1F, 0x7F)
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/**
 * Validate and normalize an incoming WebDAV path.
 *
 * Security-critical: called before any filesystem operation.
 * Decodes exactly once, rejects encoded separators, control chars,
 * Windows reserved names, and paths that escape workspaceDir.
 */
export function validatePath(inputPath: string, workspaceDir: string): ValidationResult {
  // Step 1: Reject double-encoded sequences before decoding.
  // A double-encoded percent sign looks like %25 in the raw input.
  // e.g. %252e%252e → after one decode → %2e%2e → still encoded dots
  // We detect this by checking if decoding once still leaves encoded chars.
  let decoded: string;
  try {
    decoded = decodeURIComponent(inputPath);
  } catch {
    return { valid: false, errorCode: 400, reason: "malformed percent-encoding" };
  }

  // Reject if the decoded result still contains percent-encoded sequences
  // (indicates double-encoding was used)
  if (/%[0-9a-fA-F]{2}/.test(decoded)) {
    return { valid: false, errorCode: 400, reason: "double-encoded path" };
  }

  // Step 2: Reject encoded path separators in the *original* input
  // (%2F = /, %5C = \) — these are already decoded above but we check
  // the original to catch attempts to smuggle separators
  if (/%2[fF]|%5[cC]/.test(inputPath)) {
    return { valid: false, errorCode: 400, reason: "encoded separator" };
  }

  // Step 3: Reject null bytes and ASCII control characters
  if (CONTROL_CHARS.test(decoded)) {
    return { valid: false, errorCode: 400, reason: "control character in path" };
  }

  // Step 4: Unicode normalization — normalize to NFC to prevent NFD bypass
  const normalized = decoded.normalize("NFC");

  // Step 5: Check each path segment for Windows reserved names
  const segments = normalized.split(/[/\\]/).filter((s) => s.length > 0);
  for (const segment of segments) {
    if (WINDOWS_RESERVED.test(segment)) {
      return { valid: false, errorCode: 400, reason: `Windows reserved name: ${segment}` };
    }
  }

  // Step 6: Resolve against workspaceDir and check for traversal
  const resolvedWorkspace = path.resolve(workspaceDir);
  const resolvedPath = path.resolve(workspaceDir, normalized.replace(/^\//, ""));

  if (!resolvedPath.startsWith(resolvedWorkspace + path.sep) && resolvedPath !== resolvedWorkspace) {
    return { valid: false, errorCode: 403, reason: "outside workspace" };
  }

  return { valid: true, normalizedPath: resolvedPath };
}
