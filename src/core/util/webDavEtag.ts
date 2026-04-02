/** WebDAV ETag string (quoted hex mtime-size), same formula across GET/HEAD/PROPFIND/preconditions. */
export function formatWebDavEtag(mtime: Date, size: number): string {
  return `"${mtime.getTime().toString(16)}-${size.toString(16)}"`;
}
