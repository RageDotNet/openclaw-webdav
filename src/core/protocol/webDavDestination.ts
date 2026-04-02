import { validatePath } from "../storage/pathValidation.js";
import { buildErrorXml } from "../util/errorXml.js";

export type ParseWebDavDestinationResult =
  | { valid: false; status: number; body: string }
  | { valid: true; destPath: string };

/**
 * Parse a WebDAV Destination header into a workspace-normalized path.
 * Applies optional gateway route prefix stripping and cross-host checks.
 */
export function parseWebDavDestination(
  destinationHeader: string,
  serverHost: string | undefined,
  workspaceDir: string,
  routePrefix?: string,
): ParseWebDavDestinationResult {
  let destUrl: URL;
  try {
    destUrl = new URL(destinationHeader);
  } catch {
    return { valid: false, status: 400, body: buildErrorXml("no-conflicting-lock") };
  }

  if (serverHost && destUrl.host !== serverHost) {
    return { valid: false, status: 502, body: buildErrorXml("no-conflicting-lock") };
  }

  let destPathRaw = decodeURIComponent(destUrl.pathname);
  if (routePrefix && destPathRaw.startsWith(routePrefix)) {
    destPathRaw = destPathRaw.slice(routePrefix.length) || "/";
  }
  const validation = validatePath(destPathRaw, workspaceDir);
  if (!validation.valid) {
    return { valid: false, status: validation.errorCode, body: buildErrorXml("no-conflicting-lock") };
  }

  return { valid: true, destPath: validation.normalizedPath };
}
