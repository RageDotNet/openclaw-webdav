/**
 * Standard WebDAV error condition names per RFC 4918 §14.
 * These are used as the element name inside <D:error>.
 */
export type DavErrorCondition =
  | "lock-token-matches-request-uri"
  | "lock-token-submitted"
  | "no-conflicting-lock"
  | "no-external-entities"
  | "preserved-live-properties"
  | "propfind-finite-depth"
  | "cannot-modify-protected-property"
  | "precondition-failed"
  | "valid-resourcetype"
  | "resource-must-be-null"
  | "need-privileges";

/**
 * Build an RFC 4918 §14-compliant DAV:error XML body.
 *
 * Format:
 *   <?xml version="1.0" encoding="utf-8"?>
 *   <D:error xmlns:D="DAV:"><D:{condition}/></D:error>
 */
export function buildErrorXml(condition: DavErrorCondition | string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<D:error xmlns:D="DAV:"><D:${condition}/></D:error>`
  );
}
