/** Normalize gateway mount path (e.g. `/webdav`) for URL joining. */
export function normalizeRoutePrefix(prefix: string | undefined): string | undefined {
  if (prefix === undefined || prefix === null) return undefined;
  let p = String(prefix).trim();
  if (p === "") return undefined;
  if (!p.startsWith("/")) p = `/${p}`;
  while (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }
  return p;
}
